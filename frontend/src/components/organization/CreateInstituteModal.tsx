"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import { MODULE_CODES, MODULE_LABELS, type ModuleCode } from "@/lib/types";
import { INDIAN_STATE_OPTIONS } from "@/lib/indianStates";

export function CreateInstituteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useAuth();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [modules, setModules] = useState<Set<ModuleCode>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName("");
    setCode("");
    setAddress("");
    setCity("");
    setState("");
    setModules(new Set());
    setError(null);
  }

  function handleClose() {
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/organization/institutes", {
        method: "POST",
        body: JSON.stringify({
          name,
          code: code.toUpperCase(),
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          modules: Array.from(modules),
        }),
      });
      await refresh();
      handleClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create the institute.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New institute"
      description="Add a branch under your organization — its data stays fully separate from your other institutes."
      width="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-institute-form" disabled={submitting}>
            {submitting ? "Creating…" : "Create institute"}
          </Button>
        </>
      }
    >
      <form id="create-institute-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Institute name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Campus" />
          <Input
            label="Institute code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SP20A"
            minLength={2}
            maxLength={5}
            className="uppercase"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="sm:col-span-3" />
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Dropdown label="State" value={state} onChange={setState} options={INDIAN_STATE_OPTIONS} placeholder="Select state…" />
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium text-foreground">Modules</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MODULE_CODES.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  modules.has(m) ? "border-primary bg-secondary text-secondary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                <input type="checkbox" className="accent-(--primary)" checked={modules.has(m)} onChange={() => toggleModule(m)} />
                {MODULE_LABELS[m]}
              </label>
            ))}
          </div>
        </div>

        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
