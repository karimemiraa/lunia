import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export default function Home() {
  const t = useTranslations("home");
  const nav = useTranslations("nav");
  return (
    <main>
      <Container>
        <h1 className="font-[var(--font-display)] text-5xl mt-24">{t("heroStatement")}</h1>
        <div className="mt-8">
          <Button>{nav("book")}</Button>
        </div>
      </Container>
    </main>
  );
}
