"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { MODULE_CODES, MODULE_LABELS, type ModuleCode, type Plan } from "@/lib/types";
import { INDIAN_STATE_OPTIONS } from "@/lib/indianStates";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  existingInstituteCount: number;
}

export function AddInstituteModal({
  open,
  onClose,
  onCreated,
  organizationId,
  organizationCode,
  organizationName,
  existingInstituteCount,
}: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [planCode, setPlanCode] = useState("STARTER");
  const [modules, setModules] = useState<Set<ModuleCode>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const suggestedCode =
    existingInstituteCount === 0 ? organizationCode : `${organizationCode}-0${existingInstituteCount + 1}`;

  useEffect(() => {
    if (!open) return;
    apiFetch<Plan[]>("/platform/plans").then(setPlans).catch(() => {});
    setName(existingInstituteCount === 0 ? organizationName : "");
    setCode(suggestedCode);
    setCodeTouched(false);
    setCity("");
    setState("");
    setPlanCode("STARTER");
    setModules(new Set());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleModule(m: ModuleCode) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  async function handleSubmit() {
    if (!name.trim()) return setError("Institute name is required.");
    if (code.trim().length < 2 || code.trim().length > 8) return setError("Institute code must be 2-8 characters.");

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/platform/organizations/${organizationId}/institutes`, {
        method: "POST",
        body: JSON.stringify({
          name,
          code: code.toUpperCase(),
          city: city || undefined,
          state: state || undefined,
          planCode,
          modules: Array.from(modules),
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the institute.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add institute"
      description={`New branch under ${organizationName}`}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create institute"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Institute name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Institute code"
            required
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setCodeTouched(true);
            }}
            minLength={2}
            maxLength={8}
            className="uppercase"
          />
        </div>
        {!codeTouched && (
          <p className="text-xs text-muted-foreground">
            Suggested code based on branch order — edit it if you&apos;d like something else.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Dropdown label="State" value={state} onChange={setState} options={INDIAN_STATE_OPTIONS} placeholder="Select state…" />
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

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </div>
    </Modal>
  );
}
