import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import {
  computeGosi,
  computeCommission,
  buildPayslip,
  canTransition,
  createPayrollRun,
  updatePayslip,
  recalculatePayrollRun,
  approvePayrollRun,
  markPayrollRunPaid,
  bankTransferRows,
  getPayrollRun,
  deleteDraftRun,
} from "@/modules/hr/payroll";
import { saveEmployeeRecord } from "@/modules/hr/employees";
import { requestLeave, decideLeave } from "@/modules/hr/leave";
import { cleanupHrTestData, createStaff } from "./helpers";

describe("GOSI", () => {
  it("charges Saudis 9.75% (employee) and 11.75% (employer) of basic + housing", () => {
    const g = computeGosi({ isSaudi: true, gosiApplicable: true, basicMinor: 10_000_00, housingMinor: 2_500_00 });
    expect(g.baseMinor).toBe(12_500_00);
    expect(g.employeeMinor).toBe(1_218_75);
    expect(g.employerMinor).toBe(1_468_75);
  });

  it("caps the contribution base at SAR 45,000", () => {
    const g = computeGosi({ isSaudi: true, gosiApplicable: true, basicMinor: 40_000_00, housingMinor: 10_000_00 });
    expect(g.baseMinor).toBe(45_000_00);
    expect(g.employeeMinor).toBe(4_387_50);
    expect(g.employerMinor).toBe(5_287_50);
  });

  it("charges non-Saudis nothing and the employer 2% occupational hazards", () => {
    const g = computeGosi({ isSaudi: false, gosiApplicable: true, basicMinor: 8_000_00, housingMinor: 2_000_00 });
    expect(g.employeeMinor).toBe(0);
    expect(g.employerMinor).toBe(200_00);
    const capped = computeGosi({ isSaudi: false, gosiApplicable: true, basicMinor: 60_000_00, housingMinor: 0 });
    expect(capped.employerMinor).toBe(900_00);
  });

  it("is zero when GOSI does not apply", () => {
    expect(computeGosi({ isSaudi: true, gosiApplicable: false, basicMinor: 9_000_00, housingMinor: 0 })).toEqual({
      baseMinor: 0,
      employeeMinor: 0,
      employerMinor: 0,
    });
  });
});

describe("commission and net", () => {
  it("applies basis points to revenue with halala rounding", () => {
    expect(computeCommission(20_000_00, 500)).toBe(1_000_00);
    expect(computeCommission(333, 250)).toBe(8); // 8.325 -> 8
    expect(computeCommission(10_000_00, 0)).toBe(0);
  });

  it("net = gross - deductions - employee GOSI", () => {
    const slip = buildPayslip(
      {
        basicSalaryMinor: 10_000_00,
        housingAllowanceMinor: 2_500_00,
        transportAllowanceMinor: 1_000_00,
        otherAllowanceMinor: 0,
        commissionBp: 1000,
        isSaudi: true,
        gosiApplicable: true,
      },
      5_000_00,
      { overtimeMinor: 300_00, bonusMinor: 200_00, deductionsMinor: 100_00, notes: null },
    );
    expect(slip.commissionMinor).toBe(500_00);
    // gross 14,500; minus 100 deductions, minus 1,218.75 GOSI
    expect(slip.netMinor).toBe(14_500_00 - 100_00 - 1_218_75);
  });
});

describe("payroll state machine", () => {
  it("only moves forward one step at a time", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "PAID")).toBe(true);
    expect(canTransition("DRAFT", "PAID")).toBe(false);
    expect(canTransition("PAID", "DRAFT")).toBe(false);
    expect(canTransition("APPROVED", "DRAFT")).toBe(false);
  });
});

describe("payroll run (DB)", () => {
  // A far-future month nobody else uses, randomized so reruns never collide.
  const MONTH = `20${60 + Math.floor(Math.random() * 30)}-0${1 + Math.floor(Math.random() * 9)}`;
  let staffId: string;
  let otherId: string;
  let managerId: string;

  beforeAll(async () => {
    await cleanupHrTestData();
    await prisma.payrollRun.deleteMany({ where: { periodMonth: MONTH } });
    staffId = await createStaff("payroll");
    otherId = await createStaff("payroll-other");
    managerId = await createStaff("payroll-mgr");
    expect(
      (
        await saveEmployeeRecord(staffId, {
          isSaudi: "on",
          gosiApplicable: "on",
          hireDate: "2024-01-01",
          basicSalaryMinor: "9000",
          housingAllowanceMinor: "3000",
          transportAllowanceMinor: "600",
          commissionPct: "10",
          iban: "SA03 8000 0000 6080 1016 7519",
          nationalId: "1012345678",
          bankName: "Al Rajhi",
        })
      ).ok,
    ).toBe(true);
    expect((await saveEmployeeRecord(otherId, { basicSalaryMinor: "5000", gosiApplicable: "on" })).ok).toBe(true);

    // Completed + cancelled appointments for staffId in MONTH; only COMPLETED counts.
    const service = await prisma.service.findFirstOrThrow();
    const room = await prisma.room.findFirstOrThrow();
    const client = await prisma.user.create({
      data: {
        type: "CLIENT",
        email: `hr-test-client-${Math.random().toString(36).slice(2, 8)}@test.local`,
        clientProfile: { create: { fullName: "HR Test Client" } },
      },
      include: { clientProfile: true },
    });
    const at = (day: string, min: number) => centerLocalToUtc(`${MONTH}-${day}`, min);
    for (const [status, price, day] of [
      ["COMPLETED", 1_500_00, "05"],
      ["COMPLETED", 2_500_00, "06"],
      ["CANCELLED", 9_000_00, "07"],
    ] as const) {
      await prisma.booking.create({
        data: {
          clientProfileId: client.clientProfile!.id,
          status,
          appointments: {
            create: {
              serviceId: service.id,
              staffUserId: staffId,
              roomId: room.id,
              startAt: at(day, 600),
              endAt: at(day, 660),
              priceMinorSnapshot: price,
            },
          },
        },
      });
    }

    // Two approved unpaid days in the month.
    const leave = await requestLeave(staffId, { type: "UNPAID", startDateISO: `${MONTH}-10`, endDateISO: `${MONTH}-11` });
    expect(leave.ok).toBe(true);
    if (leave.ok) await decideLeave(leave.id, "APPROVED", managerId);
  });

  afterAll(async () => {
    await prisma.payrollRun.deleteMany({ where: { periodMonth: MONTH } });
    await cleanupHrTestData();
  });

  it("generates payslips with commission, GOSI and a suggested unpaid-leave deduction", async () => {
    const { id } = await createPayrollRun(MONTH, managerId);
    await expect(createPayrollRun(MONTH, managerId)).rejects.toThrow(/already exists/);

    const run = await getPayrollRun(id);
    const slip = run!.payslips.find((p) => p.userId === staffId)!;
    expect(slip.commissionMinor).toBe(400_00); // 10% of 4,000 completed
    expect(slip.gosiEmployeeMinor).toBe(1_170_00); // 9.75% of 12,000
    expect(slip.gosiEmployerMinor).toBe(1_410_00); // 11.75% of 12,000
    expect(slip.deductionsMinor).toBe(2 * 420_00); // 12,600 / 30 = 420 per day
    expect(slip.netMinor).toBe(9_000_00 + 3_000_00 + 600_00 + 400_00 - 840_00 - 1_170_00);

    const other = run!.payslips.find((p) => p.userId === otherId)!;
    expect(other.gosiEmployeeMinor).toBe(0);
    expect(other.gosiEmployerMinor).toBe(100_00);
    expect(run!.totalNetMinor).toBe(run!.payslips.reduce((s, p) => s + p.netMinor, 0));
  });

  it("allows edits in DRAFT and keeps them through a recalculation", async () => {
    const run = await prisma.payrollRun.findUniqueOrThrow({ where: { periodMonth: MONTH }, include: { payslips: true } });
    const slip = run.payslips.find((p) => p.userId === staffId)!;
    await updatePayslip(slip.id, { overtime: "250", bonus: "100", deductions: "0", notes: "Adjusted" });
    await recalculatePayrollRun(run.id);
    const after = await prisma.payslip.findUniqueOrThrow({ where: { id: slip.id } });
    expect(after.overtimeMinor).toBe(250_00);
    expect(after.deductionsMinor).toBe(0);
    expect(after.netMinor).toBe(9_000_00 + 3_000_00 + 600_00 + 400_00 + 250_00 + 100_00 - 1_170_00);
    const bankEarly = bankTransferRows(run.id);
    await expect(bankEarly).rejects.toThrow(/Approve/);
  });

  it("locks the run after approval and moves to PAID", async () => {
    const run = await prisma.payrollRun.findUniqueOrThrow({ where: { periodMonth: MONTH }, include: { payslips: true } });
    await expect(markPayrollRunPaid(run.id)).rejects.toThrow();
    await approvePayrollRun(run.id, managerId);
    await expect(approvePayrollRun(run.id, managerId)).rejects.toThrow();

    const slip = run.payslips[0]!;
    await expect(updatePayslip(slip.id, { overtime: "999" })).rejects.toThrow(/approved/);
    await expect(recalculatePayrollRun(run.id)).rejects.toThrow(/approved/);
    await expect(deleteDraftRun(run.id)).rejects.toThrow();

    const bank = await bankTransferRows(run.id);
    const row = bank.rows.find((r) => r.iban === "SA0380000000608010167519")!;
    expect(row.nationalId).toBe("1012345678");
    expect(row.net).toBe(((9_000_00 + 3_000_00 + 600_00 + 400_00 + 250_00 + 100_00 - 1_170_00) / 100).toFixed(2));

    await markPayrollRunPaid(run.id);
    const paid = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).not.toBeNull();
    expect(paid.approvedById).toBe(managerId);
  });
});
