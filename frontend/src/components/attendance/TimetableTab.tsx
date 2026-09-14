"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { TimetableSlotModal } from "./TimetableSlotModal";
import { GenerateLecturesModal } from "./GenerateLecturesModal";
import { fmtTime12 } from "@/lib/format";
import {
  DAYS_OF_WEEK,
  DAY_OF_WEEK_LABELS,
  DAY_OF_WEEK_SHORT,
  type DayOfWeek,
  type TimetableSlot,
  type Batch,
  type Room,
  type FacultyRef,
} from "@/lib/types";

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block shrink-0">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function TimetableTab() {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [faculty, setFaculty] = useState<FacultyRef[]>([]);

  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeDay, setActiveDay] = useState<DayOfWeek>("MONDAY");
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [slotToEdit, setSlotToEdit] = useState<TimetableSlot | null>(null);

  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimetableSlot | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [slotData, batchData, roomData, facultyData] = await Promise.all([
        apiFetch<TimetableSlot[]>("/timetable"),
        apiFetch<Batch[]>("/academics/batches"),
        apiFetch<Room[]>("/rooms").catch(() => []),
        apiFetch<FacultyRef[]>("/attendance/faculty").catch(() => []),
      ]);
      setSlots(slotData);
      setBatches(batchData);
      setRooms(roomData);
      setFaculty(facultyData);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load timetable slots.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredSlots = slots.filter((s) => {
    if (selectedBatch && s.batch.id !== selectedBatch) return false;
    if (selectedRoom && s.room?.id !== selectedRoom) return false;
    if (selectedFaculty && s.faculty.id !== selectedFaculty) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSub = s.subject.name.toLowerCase().includes(q) || s.subject.shortCode.toLowerCase().includes(q);
      const matchFac = s.faculty.fullName.toLowerCase().includes(q);
      const matchBatch = s.batch.name.toLowerCase().includes(q);
      const matchRoom = s.room?.name.toLowerCase().includes(q) ?? false;
      if (!matchSub && !matchFac && !matchBatch && !matchRoom) return false;
    }
    return true;
  });

  const slotsByDay: Record<DayOfWeek, TimetableSlot[]> = {
    MONDAY: [],
    TUESDAY: [],
    WEDNESDAY: [],
    THURSDAY: [],
    FRIDAY: [],
    SATURDAY: [],
    SUNDAY: [],
  };

  filteredSlots.forEach((slot) => {
    if (slotsByDay[slot.dayOfWeek]) {
      slotsByDay[slot.dayOfWeek].push(slot);
    }
  });

  // Sort slots by start time inside each day
  DAYS_OF_WEEK.forEach((d) => {
    slotsByDay[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/timetable/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete timetable slot.");
    } finally {
      setDeleting(false);
    }
  }

  function handleOpenEdit(slot: TimetableSlot) {
    setSlotToEdit(slot);
    setSlotModalOpen(true);
  }

  function handleOpenAdd() {
    setSlotToEdit(null);
    setSlotModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Top Filter and Action Bar */}
      <div className="flex flex-col gap-4 bg-card p-4 rounded-xl border border-border sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          <Input
            placeholder="Search subject, faculty, room…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Dropdown
            value={selectedBatch}
            onChange={setSelectedBatch}
            options={[
              { value: "", label: "All Batches" },
              ...batches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <Dropdown
            value={selectedRoom}
            onChange={setSelectedRoom}
            options={[
              { value: "", label: "All Rooms / Labs" },
              ...rooms.map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
          <Dropdown
            value={selectedFaculty}
            onChange={setSelectedFaculty}
            options={[
              { value: "", label: "All Faculty" },
              ...faculty.map((f) => ({ value: f.id, label: f.fullName })),
            ]}
          />
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button variant="secondary" onClick={() => setGenerateModalOpen(true)} className="flex items-center gap-1.5">
            <SparklesIcon />
            <span className="hidden sm:inline">Generate</span> Lectures
          </Button>
          <Button onClick={handleOpenAdd}>+ Add Slot</Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</div>}

      {/* Desktop Grid Layout (7 columns for 7 days) */}
      <div className="hidden lg:grid grid-cols-7 gap-3.5 items-start">
        {DAYS_OF_WEEK.map((day) => {
          const daySlots = slotsByDay[day];
          return (
            <div key={day} className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {DAY_OF_WEEK_SHORT[day]}
                </span>
                <span className="inline-flex h-5 items-center justify-center rounded-full bg-secondary px-2 text-[10px] font-semibold text-muted-foreground">
                  {daySlots.length}
                </span>
              </div>

              <div className="p-2 space-y-2.5 min-h-[300px]">
                {loading ? (
                  <SkeletonRow lines={3} />
                ) : daySlots.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground/60 italic">No slots</div>
                ) : (
                  daySlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="group relative rounded-lg border border-border/80 bg-background p-2.5 transition-all hover:border-accent/50 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="font-semibold text-xs text-accent">
                          {fmtTime12(slot.startTime)}–{fmtTime12(slot.endTime)}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(slot)}
                            className="p-1 rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title="Edit slot"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(slot)}
                            className="p-1 rounded text-muted-foreground hover:bg-danger-soft hover:text-danger"
                            title="Delete slot"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>

                      <div className="mt-1 font-medium text-xs text-foreground line-clamp-1">
                        {slot.subject.name}
                      </div>

                      <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                        {slot.batch.name}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                        <span className="rounded bg-secondary/80 px-1.5 py-0.5 font-medium text-foreground">
                          {slot.faculty.fullName}
                        </span>
                        {slot.room && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent">
                            <LocationIcon /> {slot.room.name}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile & Tablet Tab View */}
      <div className="lg:hidden space-y-4">
        {/* Day Pills Navigation */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {DAYS_OF_WEEK.map((day) => {
            const count = slotsByDay[day].length;
            const isActive = activeDay === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setActiveDay(day)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:bg-secondary border border-border"
                }`}
              >
                <span>{DAY_OF_WEEK_SHORT[day]}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActive ? "bg-accent-foreground/20 text-accent-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Day Slots List */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">
              {DAY_OF_WEEK_LABELS[activeDay]} Schedule
            </h3>
            <span className="text-xs text-muted-foreground font-medium">
              {slotsByDay[activeDay].length} slot(s)
            </span>
          </div>

          {loading ? (
            <SkeletonRow lines={4} />
          ) : slotsByDay[activeDay].length === 0 ? (
            <EmptyState
              message={`No timetable slots configured for ${DAY_OF_WEEK_LABELS[activeDay]}.`}
              actionLabel="Add Slot"
              onAction={handleOpenAdd}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {slotsByDay[activeDay].map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-xl border border-border bg-background p-4 flex flex-col justify-between space-y-3 hover:border-accent/40 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-accent">
                        {fmtTime12(slot.startTime)} – {fmtTime12(slot.endTime)}
                      </span>
                      {slot.room ? (
                        <Badge tone="accent" className="flex items-center gap-1">
                          <LocationIcon /> {slot.room.name}
                        </Badge>
                      ) : (
                        <Badge tone="warning">No room assigned</Badge>
                      )}
                    </div>
                    <p className="font-semibold text-base text-foreground">{slot.subject.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Batch: <span className="font-medium text-foreground">{slot.batch.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Faculty: <span className="font-medium text-foreground">{slot.faculty.fullName}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button variant="secondary" onClick={() => handleOpenEdit(slot)} className="text-xs h-8">
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleteTarget(slot)} className="text-xs h-8 text-danger hover:bg-danger-soft">
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Timetable Slot Create/Edit Modal */}
      <TimetableSlotModal
        open={slotModalOpen}
        onClose={() => setSlotModalOpen(false)}
        onSaved={loadData}
        slotToEdit={slotToEdit}
      />

      {/* Generate Lectures Bulk Modal */}
      <GenerateLecturesModal
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        onGenerated={loadData}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Timetable Slot"
        description="Are you sure you want to delete this recurring timetable slot?"
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="text-sm text-foreground space-y-1">
            <p><strong>Subject:</strong> {deleteTarget.subject.name}</p>
            <p><strong>Batch:</strong> {deleteTarget.batch.name}</p>
            <p><strong>Day & Time:</strong> {DAY_OF_WEEK_LABELS[deleteTarget.dayOfWeek]}, {fmtTime12(deleteTarget.startTime)}–{fmtTime12(deleteTarget.endTime)}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
