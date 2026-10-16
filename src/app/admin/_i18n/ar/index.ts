// All staff-console Arabic, merged. One file per admin area keeps parallel
// work conflict-free; tests/admin/i18n.test.ts checks entries never disagree.
//
//   common      everyday words used everywhere
//   chrome      sidebar, breadcrumbs, palette, top bar, Ask Lunia
//   shared      _components, _ui, src/components/admin, dashboard, search,
//               notifications, requests, audit, documents, login, me
//   clients     clients
//   inventory   inventory
//   scheduling  calendar, booking, waitlist
//   finance     billing, memberships, commerce, accounting
//   people      hr, users, roles, tiers
//   content     catalog, content, media, marketing, reviews, comms, whatsapp
//   journey     visit board, arrival alerts, visit timeline, flow report
//   assistant   Ask Lunia replies (src/modules/staffAssistant)
//   operations  settings, leads, callbacks, inquiries, clinical, assistant, reports
import assistant from "./assistant";
import journey from "./journey";
import chrome from "./chrome";
import common from "./common";
import clients from "./clients";
import shared from "./shared";
import inventory from "./inventory";
import scheduling from "./scheduling";
import finance from "./finance";
import people from "./people";
import content from "./content";
import operations from "./operations";

export const SECTIONS: Record<string, Record<string, string>> = {
  common,
  chrome,
  assistant,
  journey,
  clients, shared, inventory, scheduling, finance, people, content, operations,
};

const AR: Record<string, string> = Object.assign({}, ...Object.values(SECTIONS));

export default AR;
