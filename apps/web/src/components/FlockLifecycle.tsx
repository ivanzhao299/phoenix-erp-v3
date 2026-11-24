"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { FlockLifecycleFields, type FlockLifecycleInput } from "./FlockLifecycleFields";
import {
  clearFlockCreate, createPendingFlockCreate, flockBusinessToday, flockDay, flockDifferenceKinds, flockEvidenceKinds, flockFormActor, flockFormIdentity,
  flockFormParams, flockInteger, flockEntryHint, flockLifecycleEndpoint as endpoint, flockCountKinds, flockReverseKinds,
  flockSettlementPreview, flockSpecialMenus, isFlockLifecycleKind, isFlockLifecyclePage, loadFlockCreate,
  readyForFlockEntry, retainFlockCreate, shortFlockTasks, type FlockLifecycleDocument, type FlockLifecycleFormContext,
  type FlockLifecycleKind, type FlockRow, type PendingFlockCreate,
} from "./flock-lifecycle-form";
import css from "./FlockLifecycleForm.module.css";
import { documentIdPattern } from "./breeding/flock-lifecycle-workspace";
import FlockBreedConfirmation from "@/components/breeding/FlockBreedConfirmation";
import { DrawerV2, ModalV2, ConfirmDialogV2 } from "@/components/design-system";
import { AttachmentUploader } from "@/components/design-system/forms/AttachmentUploader";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermission } from "@/hooks/usePermission";
import request, { type ApiError } from "@/lib/api-client";

export { isFlockLifecyclePage };
export type { FlockLifecycleDocument, FlockLifecycleFormContext };

interface Props {
  context: FlockLifecycleFormContext;
  onClose: () => void;
  onSaved: (document: FlockLifecycleDocument, originalId?: string) => void;
  mobile?: boolean;
}

const str = (value: unknown) => String(value ?? "");
const formLabelKey = (key: string) => "flockForm." + key;

function useResource<T>(path: string) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  const key = JSON.stringify([path, revision]);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    request<{ data: T }>(path, { signal: controller.signal, cache: "no-store", silent: true }).then(
      ({ data }) => { if (!controller.signal.aborted) setResult({ key, data }); },
      (error: Error) => { if (!controller.signal.aborted) setResult({ key, error: error.message }); },
    );
    return () => controller.abort();
  }, [key, path]);
  const current = result?.key === key ? result : undefined;
  return { ...current, loading: Boolean(path && !current), refresh: () => setRevision(prev => prev + 1) };
}

interface SearchRows {
  items: FlockRow[];
  nextCursor?: string;
  hasHouseDayReports?: boolean;
}

interface OriginalDocument extends FlockLifecycleDocument {
  events?: FlockRow[];
  reversal?: { already_reversed?: boolean; reclassify_without_changing_quantity?: boolean };
}

interface Selection {
  houseCode: string;
  date: string;
  flockNo: string;
  heldId: string;
  documentId: string;
  reportId?: string;
  shift?: string;
  occupancyId?: string;
}

const emptyInput: FlockLifecycleInput = {
  actual: "", sourceKind: "SUPPLIER", sourceCode: "", sourceFarmCode: "", sourceReceipt: "", breedCode: "",
  placementAge: "", plannedEliminationDate: "", targetHouseCode: "", positionCode: "", salesRef: "",
  disposalMethod: "", receiver: "", differenceReceipt: "", replacementKind: "", replacementQuantity: "",
  customerCode: "", currencyCode: "", unitPrice: "", finalProductionStatus: "REPORTED",
  reason: "", responsible: "", grades: {}, feed: "", water: "", notes: "", evidence: [],
};

function initialSelection(context: FlockLifecycleFormContext): Selection {
  return {
    houseCode: context.houseCode ?? "", date: context.kind === "HISTORY_AUTH" ? flockBusinessToday() : context.date ?? flockBusinessToday(),
    flockNo: context.flockNo ?? "", heldId: context.heldId ?? "", documentId: context.documentId ?? "",
    reportId: context.dailyLogId, shift: context.shift, occupancyId: context.occupancyId,
  };
}

function originalInput(report?: FlockRow): FlockLifecycleInput {
  if (!report) return emptyInput;
  return {
    ...emptyInput, feed: str(report.feed_consumed), water: str(report.water_consumed), notes: str(report.notes),
    grades: Object.fromEntries(Object.entries((report.eggs_by_grade ?? {}) as FlockRow).map(([key, value]) => [key, str(value)])),
  };
}

const documentKinds = ["REVERSE", "HISTORY_AUTH"];
const historicalKinds = ["REPORT_CORRECTION", "REVERSE", "HISTORY_AUTH"];
// Keep same-tab history navigation reversible during an unsaved task. Transmitted requests use
// the separately scoped sessionStorage protocol so they can also survive a page reload.
let draftOwner: string | undefined;
const drafts = new Map<string, { selection: Selection; input: FlockLifecycleInput }>();
function getDraft(owner: string, identity: string) {
  return draftOwner === owner ? drafts.get(identity) : undefined;
}
function rememberDraft(owner: string, identity: string, selection: Selection, input?: FlockLifecycleInput) {
  if (draftOwner !== owner) { drafts.clear(); draftOwner = owner; }
  drafts.delete(identity);
  if (input) drafts.set(identity, { selection, input });
  const oldest = drafts.keys().next().value;
  if (drafts.size > 16 && oldest) drafts.delete(oldest);
}

const noFlockKinds = ["ADMIT", "CLEAN_START", "CLEAN_ACCEPT"];
const byOccupancyKinds = ["REPORT_CORRECTION", "MORTALITY", "CULL", "CLOSE", "TRANSFER", "ADJUST"];

export default function FlockLifecycle(props: Props) {
  const { context, mobile, onClose } = props;
  const { t } = useLanguage();
  const access = usePermission("MENU_FARM_DATA");
  const create = usePermission("MENU_FLOCK_CREATE");
  const kind = isFlockLifecycleKind(context.kind) ? context.kind : null;
  const specialName = kind ? flockSpecialMenus[kind] : undefined;
  const special = usePermission(specialName);
  const actor = flockFormActor(access.user);
  if (kind && actor && access.canView && create.canEdit && (!specialName || special.canApprove)) {
    return <FlockTask key={actor + flockFormIdentity(context)} {...props} owner={actor} kind={kind} />;
  }
  return <TaskContainer kind={context.kind} title={t("flockForm.unavailable")} mobile={mobile}
    onClose={onClose} footer={<button className={css.secondary} type="button" onClick={onClose}>{t("flockForm.back")}</button>}>
    <p role="alert">{t("flockForm.unavailableDetail")}</p>
  </TaskContainer>;
}

function TaskContainer({ kind, title, mobile, onClose, footer, closeDisabled, children }: {
  kind: string; title: string; mobile?: boolean; closeDisabled?: boolean;
  onClose: () => void; footer: ReactNode; children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const page = isFlockLifecyclePage(kind, mobile);
  useEffect(() => { if (page) titleRef.current?.focus(); }, [page]);
  if (page) return <section className={css.page}>
    <header className={css.pageHeader}>
      <span className={css.pageIcon}><ClipboardCheck size={22} aria-hidden /></span>
      <h1 tabIndex={-1} ref={titleRef}>{title}</h1>
    </header>
    {children}
    <div className={css.pageFooter}>{footer}</div>
  </section>;
  if (shortFlockTasks.includes(kind)) {
    return <ModalV2 open title={title} width={670} onClose={onClose} closeDisabled={closeDisabled} footer={footer}>{children}</ModalV2>;
  }
  return <DrawerV2 open title={title} width={690} onClose={onClose} closeDisabled={closeDisabled} footer={footer}>{children}</DrawerV2>;
}

function FlockTask({ kind, context, mobile, owner, onClose, onSaved }: Props & { owner: string; kind: FlockLifecycleKind }) {
  const { t, lang } = useLanguage();
  const formId = useId();
  const identity = flockFormIdentity(context);
  const archived = getDraft(owner, identity);
  const [selection, setSelection] = useState(() => archived?.selection ?? initialSelection(context));
  const [edited, setEdited] = useState<FlockLifecycleInput | undefined>(() => archived?.input);
  const [confirm, setConfirm] = useState<() => void>();
  const [breed, setBreed] = useState(false);
  const [breedReceipt, setBreedReceipt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<PendingFlockCreate | null>(() => loadFlockCreate(owner, identity));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const sending = useRef(false);
  const uploadActive = useRef(false);
  const mounted = useRef(true);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const selectionToken = useRef(0);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const houses = useResource<FlockRow[]>(endpoint + "/houses");
  const held = useResource<FlockRow[]>(kind === "SELL_HELD" && !pending ? endpoint + "/held" : "");
  const validOriginalId = documentIdPattern.test(selection.documentId);
  const original = useResource<OriginalDocument>(documentKinds.includes(kind) && validOriginalId && !pending
    ? endpoint + "/documents/" + encodeURIComponent(selection.documentId) : "");
  const originalRow = original.data;
  const heldRow = held.data?.find(row => row.id === selection.heldId && Number(row.quantity) > 0);
  const houseCode = str(originalRow?.house_code ?? heldRow?.house_code ?? selection.houseCode);
  const house = houses.data?.find(row => row.house_code === houseCode);
  const day = selection.date.length === 10 ? flockDay(selection.date) : "";
  const validHouseDay = Boolean(house && day && !pending);
  const byOccupancy = byOccupancyKinds.includes(kind);
  const needLinkedFlock = Boolean(context.flockId && !context.flockNo);
  const archiveFlocks = useResource<FlockRow[]>(house && !pending && (kind === "BASELINE" || needLinkedFlock)
    ? "/crud/brd_flocks?" + flockFormParams({ house_code: houseCode, limit: "1000" }) : "");
  const linkedFlock = needLinkedFlock ? archiveFlocks.data?.find(row => row.house_code === houseCode && str(row.id) === context.flockId) : undefined;
  const selectedFlockNo = selection.flockNo || str(linkedFlock?.flock_no);
  const occupancies = useResource<SearchRows>(byOccupancy && validHouseDay
    ? endpoint + "/occupancies/search?" + flockFormParams({ houseCode, date: day }) : "");
  const matches = (occupancies.data?.items ?? []).filter(row => (!selectedFlockNo || selectedFlockNo === row.flock_no)
    && (!selection.occupancyId || selection.occupancyId === row.occupancy_id));
  const occupancy = matches.length === 1 ? matches[0] : undefined;
  const legacyRows = kind === "BASELINE" ? (archiveFlocks.data ?? []).filter(row => row.house_code === houseCode && row.status !== "RETIRED") : [];
  const oldFlock = legacyRows.find(row => selectedFlockNo ? row.flock_no === selectedFlockNo : !needLinkedFlock && legacyRows.length === 1);
  const flockNo = str(originalRow?.flock_no ?? heldRow?.flock_no ?? oldFlock?.flock_no ?? occupancy?.flock_no);
  const breedStatus = useResource<{ status: string }>(kind === "BASELINE" && oldFlock && flockNo && !pending
    ? endpoint + "/flocks/" + encodeURIComponent(flockNo) + "/breed-confirmation" : "");
  const needsBalance = Boolean(flockNo && !noFlockKinds.includes(kind) && !["BASELINE", "HISTORY_AUTH"].includes(kind));
  const balances = useResource<FlockRow[]>(needsBalance ? endpoint + "/balances" : "");
  const balance = balances.data?.find(row => row.flock_no === flockNo);
  const reports = useResource<SearchRows>(["REPORT_CORRECTION", "CLOSE"].includes(kind) && validHouseDay
    ? endpoint + "/reports/search?" + flockFormParams({ houseCode, date: day }) : "");
  const allReports = reports.data?.items ?? [];
  const reportRows = allReports.filter(row => row.occupancy_id === occupancy?.occupancy_id && row.flock_no === flockNo);
  const eligibleReports = reportRows.filter(row => !selection.shift || row.shift === selection.shift);
  const canSupplement = reports.data?.hasHouseDayReports === false && !allReports.length
    && (!selection.shift || selection.shift === "DAILY");
  const chosenReport = selection.reportId && selection.reportId !== "0" ? eligibleReports.find(row => str(row.id) === selection.reportId)
    : selection.reportId !== "0" && eligibleReports.length === 1 ? eligibleReports[0] : undefined;
  const supplement = canSupplement && !chosenReport && (!selection.reportId || selection.reportId === "0");
  const reportBound = Boolean(chosenReport || supplement);
  const reportHash = chosenReport ? str(chosenReport.report_hash) : supplement ? "ABSENT" : undefined;
  const reportChanged = Boolean(reportHash && edited?.reportHash && reportHash !== edited.reportHash);
  const closeChecks = useResource<FlockRow[]>(kind === "CLOSE" && occupancy && day
    ? endpoint + "/occupancies/" + encodeURIComponent(str(occupancy.occupancy_id)) + "/close-blockers?" + flockFormParams({ businessDate: day }) : "");
  const impacted = useResource<OriginalDocument>(kind === "HISTORY_AUTH" && originalRow?.kind === "REVERSE" && originalRow.payload?.originalDocumentId
    ? endpoint + "/documents/" + encodeURIComponent(str(originalRow.payload.originalDocumentId)) : "");
  const input = edited ?? originalInput(chosenReport);
  const closePreview = useResource<{ blockers: string[] }>(kind === "CLOSE" && occupancy && day
    ? endpoint + "/occupancies/" + encodeURIComponent(str(occupancy.occupancy_id)) + "/close-preview?"
      + flockFormParams({ businessDate: day, finalProductionStatus: input.finalProductionStatus }) : "");
  const delivery = useResource<{ blocked: boolean; reason: string | null }>(kind === "SELL_HELD" && heldRow && day
    ? endpoint + "/held/" + encodeURIComponent(selection.heldId) + "/delivery-blockers?" + flockFormParams({ businessDate: day }) : "");
  const dirty = Boolean(edited);
  const locked = Boolean(pending || busy);
  const target = houses.data?.find(row => row.house_code === input.targetHouseCode);
  const targets = (houses.data ?? []).filter(row => row.house_code !== houseCode && row.company_code === house?.company_code
    && readyForFlockEntry(row) && row.max_capacity != null);
  const dateStart = flockDay(balance?.transfer_earliest_on);
  const quantity = flockInteger(input.actual);
  const expected = balance?.quantity == null ? null : Number(balance.quantity);
  const diff = quantity !== null && expected !== null ? quantity - expected : null;
  const unitAmount = flockSettlementPreview(input.unitPrice, quantity);
  const originalEvent = originalRow?.events?.[0];
  const originalDelta = originalEvent?.quantity_delta == null ? null : Number(originalEvent.quantity_delta);
  const replacement = input.replacementKind ? flockInteger(input.replacementQuantity) : 0;
  const replacementDelta = replacement === null ? null : input.replacementKind === "ADJUST" ? replacement : -replacement;
  const reverseEffect = originalDelta !== null && replacementDelta !== null ? replacementDelta - originalDelta : null;
  const effectOnHeld = originalEvent && replacement !== null ? -Number(originalEvent.held_delta ?? 0)
    + (input.replacementKind === "CULL" ? replacement : 0) : null;
  const monthStart = flockBusinessToday().slice(0, 7) + "-01";
  const periodDay = flockDay(impacted.data?.business_date ?? originalRow?.business_date);
  const numericLocale = lang === "lo" ? "lo-LA" : lang === "en" ? "en-SG" : "zh-CN";
  const countFormat = new Intl.NumberFormat(numericLocale);
  const amount = (value: unknown) => value == null ? "—" : t("flockForm.birdCount").replace("{count}", countFormat.format(Number(value)));
  const dayLabel = (value: unknown) => flockDay(value) ? new Intl.DateTimeFormat(numericLocale, { dateStyle: "medium", timeZone: "Asia/Singapore" })
    .format(new Date(flockDay(value) + "T00:00:00+08:00")) : "—";
  const signed = (value: number | null) => value == null ? "—" : (value > 0 ? "+" : "") + amount(value);
  const shiftName = (value: unknown) => t(formLabelKey("shift." + str(value)), str(value) || "—");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);
  useEffect(() => {
    rememberDraft(owner, identity, selection, edited);
  }, [owner, identity, selection, edited]);
  useEffect(() => {
    if (!dirty && !busy && !uploading) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy, dirty, uploading]);

  function edit<K extends keyof FlockLifecycleInput>(name: K, value: FlockLifecycleInput[K]) {
    setEdited(current => ({ ...(current ?? input), reportHash: current?.reportHash ?? reportHash, [name]: value }));
  }

  function changeSelection(next: Selection) {
    if (locked || uploadActive.current) return;
    const run = () => {
      selectionToken.current += 1;
      setSelectionVersion(selectionToken.current);
      setSelection(next);
      setEdited(undefined);
      setFeedback("");
      setBreedReceipt("");
    };
    if (dirty) setConfirm(() => run);
    else run();
  }

  function leave() {
    if (sending.current || uploadActive.current) return;
    const run = () => {
      if (pending) clearFlockCreate(pending);
      rememberDraft(owner, identity, selection);
      onClose();
    };
    if (dirty || pending) setConfirm(() => run);
    else run();
  }

  const needsOriginal = documentKinds.includes(kind);
  const boundKind = needsOriginal || kind === "SELL_HELD";
  const contextMismatch = Boolean(
    context.houseCode && houses.data && !houses.data.some(row => row.house_code === context.houseCode)
    || context.houseCode && houseCode && context.houseCode !== houseCode
    || context.flockNo && flockNo && context.flockNo !== flockNo
    || needLinkedFlock && archiveFlocks.data && !linkedFlock
    || context.dailyLogId && (!context.houseCode || !context.date));
  const invalidReport = reports.data && kind === "REPORT_CORRECTION" && occupancy && !reportBound
    ? (selection.reportId && selection.reportId !== "0") || selection.shift && eligibleReports.length === 0
      ? "flockForm.invalidReport"
      : reports.data.hasHouseDayReports && selection.reportId === "0" ? "flockForm.supplementAlreadyExists"
        : reports.data.hasHouseDayReports && reportRows.length === 0 ? "flockForm.reportOutsideOccupancy"
          : !reportRows.length && reports.data.hasHouseDayReports === undefined ? "flockForm.reportEligibilityUncertain" : "" : "";
  const originalInvalid = originalRow && (kind === "REVERSE"
    ? originalRow.status !== "POSTED" || !flockReverseKinds.includes(originalRow.kind) || !originalEvent
    : ["POSTED", "CANCELLED"].includes(originalRow.status) || originalRow.kind === "HISTORY_AUTH" || !originalRow.source_key);
  const closeHasEggs = reportRows.some(row => ["eggs_produced", "dirty_eggs", "broken_eggs"].some(key => Number(row[key] ?? 0) > 0)
    || Object.values((row.eggs_by_grade ?? {}) as FlockRow).some(value => Number(value) > 0));
  const resources = [houses, held, original, occupancies, archiveFlocks, balances, reports, closeChecks, impacted];
  const loading = resources.some(r => r.loading);
  const resourceProblems = resources.filter(r => r.error);
  const hardErrors = [
    contextMismatch ? "flockForm.unavailableDetail" : "",
    needsOriginal && selection.documentId && !validOriginalId ? "flockForm.uuidFormat" : "",
    !day ? "flockForm.invalidDate" : "",
    kind === "ADMIT" && house && !readyForFlockEntry(house) ? flockEntryHint[str(house.entry_readiness)] ?? "flockForm.admissionBlocked" : "",
    kind === "ADMIT" && house && readyForFlockEntry(house) && house.max_capacity == null ? "flockEntry.capacity" : "",
    kind === "ADMIT" && quantity !== null && house?.max_capacity != null && quantity > Number(house.max_capacity) ? "flockForm.capacityExceeded" : "",
    kind === "CLEAN_START" && house && !["FIRST_CLEAN", "DIRTY", "READY"].includes(str(house.entry_readiness ?? house.state)) ? "flockForm.cleanStartBlocked" : "",
    kind === "CLEAN_ACCEPT" && house && (house.entry_readiness ?? house.state) !== "CLEANING" ? "flockForm.cleanAcceptBlocked" : "",
    byOccupancy && occupancies.data && !matches.length ? "flockForm.noOccupancy" : "",
    needsBalance && balances.data && !balance ? "flockForm.noBalance" : "",
    ["TRANSFER", "CLOSE", "ADJUST", "MORTALITY", "CULL"].includes(kind) && balance && (balance.house_code !== houseCode || balance.closed_on)
      ? "flockForm.inactiveOccupancy" : "",
    kind === "BASELINE" && archiveFlocks.data && (!legacyRows.length || selection.flockNo && !oldFlock) ? "flockForm.noOccupancy" : "",
    kind === "TRANSFER" && balance && !dateStart ? "flockTransfer.sourceReview" : "",
    kind === "TRANSFER" && dateStart && day && day < dateStart ? "flockTransfer.useActualDate" : "",
    kind === "TRANSFER" && target && expected !== null && expected > Number(target.max_capacity) ? "flockForm.capacityExceeded" : "",
    kind === "TRANSFER" && balance && expected === 0 ? "flockForm.emptyTransfer" : "",
    ["MORTALITY", "CULL"].includes(kind) && quantity !== null && expected !== null && quantity > expected ? "flockForm.quantityExceeded" : "",
    kind === "SELL_HELD" && selection.heldId && held.data && !heldRow ? "flockForm.heldUnavailable" : "",
    kind === "SELL_HELD" && heldRow && quantity !== null && quantity > Number(heldRow.quantity) ? "flockForm.heldExceeded" : "",
    kind === "SELL_HELD" && input.unitPrice && (!unitAmount || unitAmount === "0.00") && quantity !== null ? "flockForm.invalidPrice" : "",
    kind === "ADJUST" && diff === 0 ? "flockForm.noDifference" : "",
    invalidReport,
    reportChanged ? "flockForm.reportChanged" : "",
    originalInvalid ? "flockForm.invalidOriginal" : "",
    kind === "HISTORY_AUTH" && originalRow && !impacted.loading && periodDay >= monthStart ? "flockForm.currentPeriod" : "",
    kind === "HISTORY_AUTH" && day && day.slice(0, 7) !== monthStart.slice(0, 7) ? "flockForm.authorizationDate" : "",
    kind === "REVERSE" && originalRow?.reversal?.already_reversed ? "flockForm.alreadyReversed" : "",
    kind === "REVERSE" && reverseEffect !== 0 && originalRow?.reversal?.reclassify_without_changing_quantity ? "flockForm.reverseTransferBlocked" : "",
    kind === "CLOSE" && input.finalProductionStatus === "CONFIRMED_ZERO" && closeHasEggs ? "flockForm.zeroDenied" : "",
  ].filter(Boolean);
  const requireEvidence = flockEvidenceKinds.includes(kind);

  async function transmit(packet: PendingFlockCreate, recovering: boolean) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFeedback("");
    let receipt: FlockLifecycleDocument;
    try {
      const { data } = await request<{ data: FlockLifecycleDocument }>(endpoint + "/documents",
        { method: "POST", body: packet.request, silent: true });
      if (!data?.id) throw new Error(t("flockForm.invalidReceipt"));
      receipt = data;
    } catch (caught) {
      if (!mounted.current) return;
      const error = caught as ApiError;
      if (!recovering && error.status && [400, 404, 422].includes(error.status)) {
        clearFlockCreate(packet);
        setPending(null);
      }
      const businessKey = error.businessCode ? "breeding.lifecycleWorkspace." + error.businessCode : "";
      setFeedback(businessKey ? t(businessKey, error.message || t("flockForm.requestError"))
        : error.message || t("flockForm.requestError"));
      return;
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
    if (mounted.current) {
      clearFlockCreate(packet);
      rememberDraft(owner, identity, selection);
      setPending(null);
      setEdited(undefined);
      onSaved(receipt, packet.originalId);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || pending || sending.current || uploadActive.current || !house) return;
    const body: FlockRow = {
      kind, sourceKey: crypto.randomUUID(), houseCode, flockNo, businessDate: day,
      expectedVersion: Number(balance?.version ?? 0), reason: input.reason.trim(),
    };
    if (!input.reason.trim() || requireEvidence && !input.responsible
      || flockDifferenceKinds.includes(kind) && !input.differenceReceipt.trim()) {
      setFeedback(t("flockForm.requiredFields")); return;
    }
    if (requireEvidence && !input.evidence.length) {
      setFeedback(t("flockForm.evidenceRequired")); return;
    }
    if (input.evidence.length) body.evidence = input.evidence;
    if (input.responsible) body.responsible = input.responsible;
    if (input.differenceReceipt.trim()) body.differenceReceipt = input.differenceReceipt.trim();
    if (["ADMIT", "CLEAN_START", "CLEAN_ACCEPT"].includes(kind)) body.expectedHouseVersion = Number(house.house_version ?? 0);
    if (flockCountKinds.includes(kind) || kind === "ADJUST") {
      if (quantity === null || quantity < (kind === "BASELINE" || kind === "ADJUST" ? 0 : 1)) {
        setFeedback(t("flockForm.explicitCount")); return;
      }
      body.quantity = kind === "ADJUST" ? diff : quantity;
    }
    switch (kind) {
      case "BASELINE":
        if (oldFlock?.current_qty == null) { setFeedback(t("flockForm.noLegacyBalance")); return; }
        body.expectedLegacyQty = Number(oldFlock.current_qty);
        break;
      case "ADMIT": {
        const age = flockInteger(input.placementAge);
        if (age === null || age < 0) { setFeedback(t("flockForm.explicitAge")); return; }
        Object.assign(body, { sourceKind: input.sourceKind, sourceReceipt: input.sourceReceipt.trim(), breedCode: input.breedCode,
          placementAge: age, ...(input.sourceKind === "SUPPLIER" ? { sourceCode: input.sourceCode } : { sourceFarmCode: input.sourceFarmCode }),
          ...(input.plannedEliminationDate ? { plannedEliminationDate: input.plannedEliminationDate } : {}) });
        break;
      }
      case "MORTALITY":
        Object.assign(body, { disposalMethod: input.disposalMethod.trim(), receiver: input.receiver.trim() });
        break;
      case "CULL":
        body.positionCode = input.positionCode.trim();
        break;
      case "TRANSFER":
        body.targetHouseCode = input.targetHouseCode;
        break;
      case "SELL_HELD":
        if (!heldRow || !unitAmount || unitAmount === "0.00") { setFeedback(t("flockForm.invalidPrice")); return; }
        Object.assign(body, { heldId: selection.heldId, expectedHeldVersion: Number(heldRow.version), unitPrice: Number(input.unitPrice),
          customerCode: input.customerCode, currencyCode: input.currencyCode, salesRef: input.salesRef.trim(), receiver: input.receiver.trim() });
        break;
      case "CLOSE":
        body.finalProductionStatus = input.finalProductionStatus;
        break;
      case "REVERSE":
        if (!originalRow || replacement === null || input.replacementKind && input.replacementKind !== "ADJUST" && replacement < 0) {
          setFeedback(t("flockForm.explicitCount")); return;
        }
        body.originalDocumentId = originalRow.id;
        if (input.replacementKind) {
          Object.assign(body, { replacementKind: input.replacementKind, replacementQuantity: replacement });
          if (input.replacementKind === "MORTALITY") Object.assign(body, { disposalMethod: input.disposalMethod.trim(), receiver: input.receiver.trim() });
          if (input.replacementKind === "CULL" && input.positionCode.trim()) body.positionCode = input.positionCode.trim();
        }
        break;
      case "REPORT_CORRECTION": {
        const quantities = Object.entries(input.grades).map(([grade, value]) => [grade, flockInteger(value)] as const);
        if (!reportBound || !quantities.length || quantities.some(([, value]) => value === null || value < 0)) {
          setFeedback(t("flockForm.reportGradeRequired")); return;
        }
        Object.assign(body, { dailyLogId: Number(chosenReport?.id ?? 0), expectedReportHash: chosenReport ? chosenReport.report_hash : "ABSENT",
          correction: { eggsByGrade: Object.fromEntries(quantities), feedConsumed: input.feed === "" ? null : Number(input.feed),
            waterConsumed: input.water === "" ? null : Number(input.water), notes: input.notes } });
        break;
      }
      case "HISTORY_AUTH":
        if (!originalRow || !periodDay || periodDay >= monthStart) { setFeedback(t("flockForm.currentPeriod")); return; }
        Object.assign(body, { periodFrom: periodDay, periodTo: periodDay, authorizedSourceKey: originalRow.source_key });
        break;
    }
    const packet = createPendingFlockCreate({ owner, identity, request: JSON.stringify(body), sourceKey: str(body.sourceKey),
      houseCode, companyCode: str(house.company_code), originalId: kind === "HISTORY_AUTH" ? originalRow?.id : undefined });
    try {
      retainFlockCreate(packet);
    } catch {
      setFeedback(t("flockForm.storageUnavailable")); return;
    }
    setPending(packet);
    void transmit(packet, false);
  }

  const missingIdentity = needsOriginal ? !originalRow : kind === "SELL_HELD" ? !heldRow : !house || (!noFlockKinds.includes(kind) && !flockNo);
  const canSubmit = !loading && !resourceProblems.length && !hardErrors.length && !missingIdentity && !uploading
    && (kind !== "REPORT_CORRECTION" || reportBound);
  const renderFacts = (items: Array<[string, ReactNode]>) => <dl className={css.facts}>{items.map(([label, value]) =>
    <div key={label}><dt>{t(formLabelKey(label))}</dt><dd>{value ?? "—"}</dd></div>)}</dl>;
  const pendingHouse = pending && houses.data?.find(row => row.house_code === pending.houseCode && row.company_code === pending.companyCode);
  const uploadIdentity = selectionVersion;
  const footer = <>
    <button type="button" className={css.secondary} disabled={busy || uploading} onClick={leave}>
      <ArrowLeft size={16} aria-hidden /> {t("flockForm.back")}
    </button>
    {pending ? <button className={css.primary} type="button" onClick={() => { if (pendingHouse) void transmit(pending, true); }} disabled={busy || !pendingHouse}>
      {t(busy ? "flockForm.saving" : "flockForm.retrySave")}
    </button> : <button className={css.primary} type="submit" form={formId} disabled={!canSubmit || locked}>
      {t("flockForm.saveDraft")}
    </button>}
  </>;

  return <>
    <TaskContainer kind={kind} mobile={mobile} title={t(formLabelKey("title." + kind))} onClose={leave}
      footer={footer} closeDisabled={busy || uploading}>
      <div className={css.content}>
        {feedback && <p className={css.error} ref={feedbackRef} tabIndex={-1} role="alert">{feedback}</p>}
        {pending ? <section aria-live="polite" className={css.callout}>
          <p>{t(busy ? "flockForm.saving" : "flockForm.pendingExplanation")}</p>
          <p>{t("flockForm.house")} <strong>{pending.houseCode}</strong></p>
          {!pendingHouse && houses.data && <p role="alert">{t("flockForm.pendingScope")}</p>}
          {houses.error && <button type="button" className={css.secondary} onClick={houses.refresh}>{t("flockForm.reload")}</button>}
        </section> : <form id={formId} onSubmit={submit} aria-busy={loading || busy}>
          <fieldset className={css.fieldset} disabled={locked || uploading}>
            <legend>{t("flockForm.objectAndDate")}</legend>
            <div className={css.fields}>
              {!boundKind && <label>{t("flockForm.house")}
                <select value={selection.houseCode} required disabled={Boolean(context.houseCode)}
                  onChange={event => changeSelection({ houseCode: event.target.value, date: selection.date, flockNo: "", heldId: "", documentId: "" })}>
                  <option value="">{t("flockForm.chooseHouse")}</option>
                  {(houses.data ?? []).filter(row => historicalKinds.includes(kind) || row.status === "ACTIVE").map(row =>
                    <option key={str(row.house_code)} value={str(row.house_code)}>{str(row.house_name)} · {str(row.house_code)}</option>)}
                </select>
              </label>}
              {kind === "SELL_HELD" && <label>{t("flockForm.held")}
                <select value={selection.heldId} required disabled={Boolean(context.heldId)}
                  onChange={event => changeSelection({ ...initialSelection(context), heldId: event.target.value, date: selection.date })}>
                  <option value="">{t("flockForm.chooseHeld")}</option>
                  {(held.data ?? []).filter(row => Number(row.quantity) > 0).map(row => <option key={str(row.id)} value={str(row.id)}>
                    {str(row.flock_no)} · {str(row.position_code)} · {amount(row.quantity)}
                  </option>)}
                </select>
              </label>}
              {needsOriginal && <label>{t("flockForm.originalDocument")}
                <input value={selection.documentId} onChange={event => changeSelection({ ...selection, documentId: event.target.value.trim() })}
                  readOnly={Boolean(context.documentId)} required />
              </label>}
              <label>{t("flockForm.date")}
                <input type="date" value={selection.date} min={kind === "TRANSFER" ? dateStart || undefined : undefined}
                  readOnly={Boolean((context.dailyLogId || context.shift) && context.date) || kind === "HISTORY_AUTH"} required
                  onChange={event => changeSelection({ ...selection, date: event.target.value, reportId: undefined, shift: undefined,
                    occupancyId: context.occupancyId, flockNo: context.flockNo ?? "" })} />
              </label>
              {kind === "BASELINE" && legacyRows.length > 1 && <label>{t("flockForm.flock")}
                <select value={flockNo} disabled={Boolean(context.flockNo || context.flockId)} required
                  onChange={event => changeSelection({ ...selection, flockNo: event.target.value })}>
                  <option value="">{t("flockForm.chooseFlock")}</option>
                  {legacyRows.map(row => <option key={str(row.flock_no)} value={str(row.flock_no)}>{str(row.flock_no)}</option>)}
                </select>
              </label>}
              {byOccupancy && (occupancies.data?.items.length ?? 0) > 1 && <label>{t("flockForm.flock")}
                <select value={flockNo} disabled={Boolean(context.flockNo || context.flockId || context.occupancyId)} required
                  onChange={event => changeSelection({ ...selection, flockNo: event.target.value, occupancyId: undefined, reportId: undefined })}>
                  <option value="">{t("flockForm.chooseFlock")}</option>
                  {occupancies.data?.items.map(row => <option key={str(row.occupancy_id)} value={str(row.flock_no)}>{str(row.flock_no)}</option>)}
                </select>
              </label>}
              {kind === "REPORT_CORRECTION" && occupancy && reports.data && (reportRows.length > 0 || canSupplement) && <label>
                {t("flockForm.report")}
                <select value={str(chosenReport?.id ?? (supplement ? "0" : ""))} required disabled={Boolean(context.dailyLogId || context.shift)}
                  onChange={event => changeSelection({ ...selection, reportId: event.target.value })}>
                  <option value="">{t("flockForm.chooseReport")}</option>
                  {eligibleReports.map(row => <option key={str(row.id)} value={str(row.id)}>{str(row.id)} · {shiftName(row.shift)} · {dayLabel(row.log_date)}</option>)}
                  {canSupplement && <option value="0">{t("flockForm.supplement")}</option>}
                </select>
              </label>}
            </div>
          </fieldset>
          {kind === "CLEAN_ACCEPT" && (house?.entry_readiness ?? house?.state) === "CLEANING"
            && renderFacts([["cleaningDocument", str(house?.document_id) || "—"]])}
          {loading && <p className={css.callout} role="status">{t("flockForm.loading")}</p>}
          {resourceProblems.map((r, i) => <p key={i} className={css.error} role="alert">
            {r.error} <button type="button" className={css.inlineButton} onClick={r.refresh}>{t("flockForm.reload")}</button>
          </p>)}
          {hardErrors.map(error => <p key={error} className={css.error} role="alert">{t(error)}</p>)}
          {reportChanged && <button type="button" className={css.inlineButton} onClick={() => changeSelection(selection)}>
            {t("flockForm.acceptReportSnapshot")}
          </button>}
          {kind === "REPORT_CORRECTION" && invalidReport === "flockForm.invalidReport" && selection.shift &&
            <p className={css.callout}>{t("flockForm.missingShift")}</p>}
          {house && renderFacts([
            ["house", str(house.house_name ?? houseCode) + " · " + houseCode],
            ...(!noFlockKinds.includes(kind) ? [["flock", flockNo || "—"]] as Array<[string, ReactNode]> : []),
            ...(occupancy ? [["occupancy", str(occupancy.occupancy_id)]] as Array<[string, ReactNode]> : []),
            ...(balance ? [["balance", amount(balance.quantity)]] as Array<[string, ReactNode]> : []),
            ...(["ADMIT", "TRANSFER"].includes(kind) ? [["capacity", amount(kind === "TRANSFER" ? target?.max_capacity : house.max_capacity)]] as Array<[string, ReactNode]> : []),
            ...(kind === "BASELINE" ? [["legacyBalance", amount(oldFlock?.current_qty)], ["actualCount", amount(quantity)],
              ["difference", signed(quantity === null || oldFlock?.current_qty == null ? null : quantity - Number(oldFlock.current_qty))]] as Array<[string, ReactNode]> : []),
            ...(kind === "ADJUST" ? [["difference", signed(diff)], ["expectedBalance", amount(quantity)]] as Array<[string, ReactNode]> : []),
            ...(kind === "TRANSFER" ? [["wholeFlock", amount(balance?.quantity)], ["targetHouse", str(target?.house_name) || "—"],
              ["earliest", dayLabel(dateStart)]] as Array<[string, ReactNode]> : []),
            ...(kind === "SELL_HELD" ? [["heldBalance", amount(heldRow?.quantity)], ["heldPosition", str(heldRow?.position_code) || "—"],
              ["settlement", unitAmount ? unitAmount + " " + input.currencyCode : "—"]] as Array<[string, ReactNode]> : []),
          ])}
          {kind === "TRANSFER" && <p className={css.callout}>{t("flockEntry.transferHint")}</p>}
          {kind === "SELL_HELD" && heldRow && <p className={delivery.data?.blocked ? css.error : css.callout} role="status">
            {t(delivery.loading ? "flockForm.withdrawalLoading" : delivery.data?.blocked
              ? delivery.data.reason === "FLOCK_REQUIRED_HOUSE_SCOPE" ? "flockForm.noBalance" : "flockForm.withdrawalBlocked"
              : delivery.data ? "flockForm.withdrawalClear" : "flockForm.withdrawalPostingCheck")}
            {delivery.error && <button type="button" className={css.inlineButton} onClick={delivery.refresh}>{t("flockForm.reload")}</button>}
          </p>}
          {kind === "REVERSE" && originalRow && renderFacts([
            ["originalDocument", originalRow.id], ["originalDate", dayLabel(originalRow.business_date)], ["originalEvent", t(formLabelKey("title." + originalRow.kind))],
            ["originalChange", signed(originalDelta)], ["replacementChange", signed(replacementDelta)], ["difference", signed(reverseEffect)],
            ["heldDifference", signed(effectOnHeld)], ["heldPosition", str(originalRow.payload?.positionCode) || "—"],
          ])}
          {kind === "HISTORY_AUTH" && originalRow && renderFacts([
            ["originalDocument", originalRow.id], ["affectedDate", dayLabel(periodDay)], ["originalEvent", t(formLabelKey("title." + originalRow.kind))],
          ])}
          {kind === "HISTORY_AUTH" && <p className={css.callout}>{t("flockForm.authorizationBinding")}</p>}
          {kind === "CLOSE" && occupancy && <fieldset className={css.fieldset}>
            <legend>{t("flockForm.closeChecklist")}</legend>
            <ul className={css.checklist}>
              <li>{t(expected === 0 ? "flockForm.zeroBalance" : "flockForm.balanceNotZero")}</li>
              <li>{t("flockForm.productionCheck")} {reportRows.length ? reportRows.map(row => shiftName(row.shift)).join(" / ") : t("flockForm.noReports")}</li>
              {!!(closeChecks.data?.length) ? closeChecks.data?.map(row => <li key={str(row.reference) + str(row.reason)}>
                {row.reason === "OTHER_SCOPE_REVIEW" ? t("flockForm.otherScopeReview")
                  : t(formLabelKey("close." + str(row.reason)), str(row.reason)) + " · " + str(row.reference)}
              </li>) : closeChecks.data && <li>{t("flockForm.handoverClear")}</li>}
              {closePreview.data ? (closePreview.data.blockers.length
                ? closePreview.data.blockers.map(reason => <li key={reason}>
                  {t(formLabelKey("close." + reason), t("flockForm.close.FLOCK_CLOSE_REVIEW_REQUIRED"))}
                </li>) : <li>{t("flockForm.closePreviewClear")}</li>)
                : <li>{t(closePreview.loading ? "flockForm.loading" : "flockForm.careAndOpenDocuments")}</li>}
            </ul>
            <button type="button" className={css.inlineButton} onClick={() => {
              closeChecks.refresh(); closePreview.refresh(); reports.refresh(); balances.refresh();
            }}>
              {t("flockForm.refreshChecks")}
            </button>
          </fieldset>}
          {!missingIdentity && (kind !== "REPORT_CORRECTION" || reportBound) && <>
            <FlockLifecycleFields kind={kind} value={input} edit={edit}
              setSourceKind={value => setEdited({ ...input, sourceKind: value, sourceCode: "", sourceFarmCode: "", sourceReceipt: "" })}
              originalReport={chosenReport} transferTargets={targets} originalHeldId={str(originalEvent?.held_id)} />
            {house && <fieldset className={css.fieldset} disabled={locked}>
              <legend>{t("flockForm.evidence")}{requireEvidence ? " *" : ""}</legend>
              <AttachmentUploader key={[houseCode, day, flockNo, str(chosenReport?.id), selection.heldId, selection.documentId].join("|")}
                value={input.evidence} onChange={value => {
                  if (mounted.current && selectionToken.current === uploadIdentity) edit("evidence", value);
                }} onUploadingChange={active => {
                  if (mounted.current) { uploadActive.current = active; setUploading(active); }
                }}
                ownership={{ moduleCode: "FLOCK_LIFECYCLE", ownerType: "HOUSE", ownerId: houseCode, companyCode: str(house.company_code),
                  storeCode: str(house.site_code) }} />
            </fieldset>}
          </>}
          {kind === "BASELINE" && oldFlock && !breedReceipt && (
            !str(oldFlock.breed_code).trim() || ["MISSING", "CATALOG_REVIEW"].includes(str(breedStatus.data?.status))
          ) && <div className={css.callout}>
            <p>{t("breeding.breed.draftNeedsConfirmation")}</p>
            <button className={css.secondary} type="button" onClick={() => setBreed(true)}>{t("ui.核对品种", "核对品种")}</button>
          </div>}
          {breedReceipt && <p className={css.callout} role="status">{breedReceipt}</p>}
        </form>}
      </div>
    </TaskContainer>
    {breed && flockNo && <FlockBreedConfirmation flockNo={flockNo} onClose={() => setBreed(false)} onConfirmed={({ receiptId }) => {
      setBreed(false);
      setBreedReceipt(receiptId ? t("breeding.breed.confirmedReceipt").replace("{id}", receiptId) : t("breeding.breed.confirmed"));
    }} />}
    <ConfirmDialogV2 open={Boolean(confirm)} title={t("flockForm.discardTitle")}
      message={t(pending ? "flockForm.discardPending" : "flockForm.discardInputs")} confirmLabel={t("flockForm.discard")}
      onCancel={() => setConfirm(undefined)} onConfirm={() => { confirm?.(); setConfirm(undefined); }} danger />
  </>;
}
