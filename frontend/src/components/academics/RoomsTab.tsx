"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { RoomModal } from "@/components/academics/RoomModal";
import type { Room } from "@/lib/types";
import type { AcademicsTabHandle } from "./tabHandle";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  canManage?: boolean;
}

export const RoomsTab = forwardRef<AcademicsTabHandle, Props>(function RoomsTab({ canManage = true }: Props, ref) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  function openCreate() {
    setEditingRoom(null);
    setModalOpen(true);
  }

  useImperativeHandle(ref, () => ({ openCreate }));

  function loadRooms() {
    setLoading(true);
    apiFetch<Room[]>("/rooms?includeInactive=true")
      .then(setRooms)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load rooms."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRooms();
  }, []);

  async function handleDelete(room: Room) {
    if (!window.confirm(`Are you sure you want to delete or deactivate "${room.name}"?`)) return;
    try {
      await apiFetch(`/rooms/${room.id}`, { method: "DELETE" });
      loadRooms();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Could not remove this room.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Classrooms & Labs</h2>
        <p className="text-sm text-muted-foreground">
          Manage physical rooms and seating capacity for lecture scheduling and clash detection.
        </p>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {loading && <p className="text-sm text-muted-foreground">Loading rooms…</p>}

      {!loading && rooms.length === 0 && (
        <EmptyState
          message="No classrooms or labs defined yet. Add rooms to enable room-wise lecture scheduling."
          actionLabel={canManage ? "Add your first room" : undefined}
          onAction={
            canManage
              ? () => {
                  setEditingRoom(null);
                  setModalOpen(true);
                }
              : undefined
          }
        />
      )}

      {!loading && rooms.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Room Name</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Building / Location</th>
                  <th className="px-4 py-3 font-medium">Capacity</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.code ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">{r.building ?? "—"}</td>
                    <td className="px-4 py-3 text-foreground">
                      {r.capacity ? `${r.capacity} seats` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.isActive ? "success" : "warning"}>
                        {r.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoom(r);
                              setModalOpen(true);
                            }}
                            className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="text-xs font-medium text-danger hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border sm:hidden">
            {rooms.map((r) => (
              <div key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.code ?? "No code"} · {r.building ?? "No location"}</p>
                  </div>
                  <Badge tone={r.isActive ? "success" : "warning"}>
                    {r.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Capacity: {r.capacity ? `${r.capacity} seats` : "—"}
                </p>
                {canManage && (
                  <div className="mt-3 flex items-center justify-end gap-4 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoom(r);
                        setModalOpen(true);
                      }}
                      className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      className="text-xs font-medium text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <RoomModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={loadRooms}
        roomToEdit={editingRoom}
      />
    </div>
  );
});
