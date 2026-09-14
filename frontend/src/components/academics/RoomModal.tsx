"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Room, CreateRoomPayload } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  roomToEdit: Room | null;
}

export function RoomModal({ open, onClose, onSaved, roomToEdit }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState("");
  const [building, setBuilding] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (roomToEdit) {
      setName(roomToEdit.name);
      setCode(roomToEdit.code ?? "");
      setCapacity(roomToEdit.capacity ? String(roomToEdit.capacity) : "");
      setBuilding(roomToEdit.building ?? "");
      setIsActive(roomToEdit.isActive);
    } else {
      setName("");
      setCode("");
      setCapacity("");
      setBuilding("");
      setIsActive(true);
    }
    setError(null);
  }, [open, roomToEdit]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Room name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: CreateRoomPayload = {
      name: name.trim(),
      code: code.trim() || undefined,
      capacity: capacity ? Number(capacity) : undefined,
      building: building.trim() || undefined,
      isActive,
    };

    try {
      if (roomToEdit) {
        await apiFetch(`/rooms/${roomToEdit.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/rooms", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save room.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={roomToEdit ? `Edit ${roomToEdit.name}` : "Add classroom / room"}
      description="Define a physical room or lab to assign when scheduling lectures and tests."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="room-form" disabled={submitting}>
            {submitting ? "Saving…" : roomToEdit ? "Save changes" : "Create room"}
          </Button>
        </>
      }
    >
      <form id="room-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Room name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Room 101, Physics Lab A" />
          <Input label="Short code (optional)" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. R101, LAB-A" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Capacity (seats, optional)" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 45" />
          <Input label="Building / Floor (optional)" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="e.g. Main Block, 2nd Floor" />
        </div>

        {roomToEdit && (
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm font-medium text-foreground">Active (available for scheduling)</span>
          </label>
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
