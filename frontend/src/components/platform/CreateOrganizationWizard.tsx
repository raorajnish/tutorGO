"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { InviteResultPanel } from "./InviteResultPanel";
import { INDIAN_STATE_OPTIONS } from "@/lib/indianStates";
import {
  MODULE_CODES,
  MODULE_LABELS,
  type ModuleCode,
  type Plan,
  type CreateOrganizationPayload,
  type CreateOrganizationResult,
  type InviteResult,
} from "@/lib/types";

const STEPS = ["Organization", "Institute", "People"];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateOrganizationWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);

  // Step 1 — organization
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgCity, setOrgCity] = useState("");
  const [orgState, setOrgState] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgEmail, setOrgEmail] = useState("");
  const [gstin, setGstin] = useState("");

  // Step 2 — first institute
  const [instCodeTouched, setInstCodeTouched] = useState(false);
  const [instName, setInstName] = useState("");
  const [instCode, setInstCode] = useState("");
  const [instCity, setInstCity] = useState("");
  const [instState, setInstState] = useState("");
  const [planCode, setPlanCode] = useState("STARTER");
  const [modules, setModules] = useState<Set<ModuleCode>>(new Set());

  // Step 3 — created org/institute + owner/admin cards
  const [created, setCreated] = useState<CreateOrganizationResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) apiFetch<Plan[]>("/platform/plans").then(setPlans).catch(() => {});
  }, [open]);

  // Institute name/code follow the org's until the user edits them directly.
  useEffect(() => {
    if (!instCodeTouched) setInstCode(orgCode);
  }, [orgCode, instCodeTouched]);

  function reset() {
    setStep(1);
    setOrgName("");
    setOrgCode("");
    setOrgAddress("");
    setOrgCity("");
    setOrgState("");
    setOrgPhone("");
    setOrgEmail("");
    setGstin("");
    setInstCodeTouched(false);
    setInstName("");
    setInstCode("");
    setInstCity("");
    setInstState("");
    setPlanCode("STARTER");
    setModules(new Set());
    setCreated(null);
    setError(null);
  }

  function handleClose() {
    // Whatever was created stays created — just reset the form state.
    if (created) onCreated();
    reset();
    onClose();
  }

  function toggleModule(m: ModuleCode) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function validateStep(): string | null {
    if (step === 1) {
      if (!orgName.trim()) return "Organization name is required.";
      if (orgCode.trim().length < 2 || orgCode.trim().length > 5) return "Organization code must be 2-5 characters.";
    }
    if (step === 2) {
      if (!instName.trim()) return "Institute name is required.";
      if (instCode.trim().length < 2 || instCode.trim().length > 8) return "Institute code must be 2-8 characters.";
    }
    return null;
  }

  async function goNext() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (step === 2) {
      await createOrgAndInstitute();
    } else {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function createOrgAndInstitute() {
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateOrganizationPayload = {
        organization: {
          name: orgName,
          code: orgCode.toUpperCase(),
          address: orgAddress || undefined,
          city: orgCity || undefined,
          state: orgState || undefined,
          phone: orgPhone || undefined,
          email: orgEmail || undefined,
          gstin: gstin || undefined,
        },
        institute: {
          name: instName,
          code: instCode.toUpperCase(),
          city: instCity || orgCity || undefined,
          state: instState || orgState || undefined,
          planCode,
          modules: Array.from(modules),
        },
      };

      const res = await apiFetch<CreateOrganizationResult>("/platform/organizations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreated(res);
      onCreated();
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the organization.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveOwner(input: { name: string; email: string; phone?: string }) {
    if (!created) return;
    const res = await apiFetch<InviteResult>(`/platform/organizations/${created.organization.id}/owner`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    setCreated((c) => (c ? { ...c, ownerInvite: res } : c));
  }

  async function saveAdmin(input: { name: string; email: string; phone?: string }) {
    if (!created) return;
    const res = await apiFetch<InviteResult>(
      `/platform/organizations/${created.organization.id}/institutes/${created.institute.id}/admins`,
      { method: "POST", body: JSON.stringify(input) }
    );
    setCreated((c) => (c ? { ...c, adminInvite: res } : c));
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New organization"
      description={`Step ${step} of 3 — ${STEPS[step - 1]}`}
      width="lg"
      footer={
        step === 3 ? (
          <Button type="button" onClick={handleClose} className="ml-auto">
            Done
          </Button>
        ) : (
          <>
            {step > 1 && (
              <Button type="button" variant="secondary" onClick={goBack} disabled={submitting}>
                Back
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting} className="mr-auto">
              Cancel
            </Button>
            <Button type="button" onClick={goNext} disabled={submitting}>
              {submitting ? "Creating…" : step === 2 ? "Create organization" : "Next"}
            </Button>
          </>
        )
      }
    >
      <div className="mb-5 flex gap-1.5">
        {STEPS.map((label, i) => (
          <div key={label} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-accent" : "bg-muted"}`} />
        ))}
      </div>

      {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Organization name" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Super20 Classes" />
            <Input
              label="Organization code"
              required
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
              placeholder="SP20"
              minLength={2}
              maxLength={5}
              className="uppercase"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Address" value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} className="sm:col-span-3" />
            <Input label="City" value={orgCity} onChange={(e) => setOrgCity(e.target.value)} />
            <Dropdown label="State" value={orgState} onChange={setOrgState} options={INDIAN_STATE_OPTIONS} placeholder="Select state…" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Phone" value={orgPhone} onChange={(e) => setOrgPhone(e.target.value)} />
            <Input label="Email" type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} />
            <Input label="GSTIN (optional)" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Every organization starts with one institute. Its code defaults to the organization
            code — later branches will auto-suggest <span className="font-mono">{orgCode || "CODE"}-02</span>,{" "}
            <span className="font-mono">-03</span>, and so on.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Institute name"
              required
              value={instName}
              onChange={(e) => setInstName(e.target.value)}
              placeholder={orgName || "Main Campus"}
            />
            <Input
              label="Institute code"
              required
              value={instCode}
              onChange={(e) => {
                setInstCode(e.target.value.toUpperCase());
                setInstCodeTouched(true);
              }}
              minLength={2}
              maxLength={8}
              className="uppercase"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="City" value={instCity} onChange={(e) => setInstCity(e.target.value)} placeholder={orgCity} />
            <Dropdown
              label="State"
              value={instState}
              onChange={setInstState}
              options={INDIAN_STATE_OPTIONS}
              placeholder={orgState || "Select state…"}
            />
          </div>

          <Dropdown label="Plan" value={planCode} onChange={setPlanCode} options={plans.map((p) => ({ value: p.code, label: p.name }))} />

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Modules</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODULE_CODES.map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    modules.has(m) ? "border-primary bg-secondary text-secondary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <input type="checkbox" className="accent-primary" checked={modules.has(m)} onChange={() => toggleModule(m)} />
                  {MODULE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && created && (
        <div className="space-y-5">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{created.organization.name}</span> ({created.organization.code}) is
            live, with institute <span className="font-semibold">{created.institute.name}</span> ({created.institute.code}).
          </p>

          <PersonCard title="Organization owner" subtitle="Manages the organization and all its institutes." result={created.ownerInvite} onSave={saveOwner} />
          <PersonCard title={`${created.institute.name} admin`} subtitle="Runs day-to-day operations for this institute." result={created.adminInvite} onSave={saveAdmin} />
        </div>
      )}
    </Modal>
  );
}

function PersonCard({
  title,
  subtitle,
  result,
  onSave,
}: {
  title: string;
  subtitle: string;
  result?: InviteResult;
  onSave: (input: { name: string; email: string; phone?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({ name, email, phone: phone || undefined });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>

      {result ? (
        <InviteResultPanel label={title} result={result} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex items-end gap-3">
            <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className="flex-1" />
            <Button type="button" variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
          {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">{error}</div>}
        </div>
      )}
    </div>
  );
}
