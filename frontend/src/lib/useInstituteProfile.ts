import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import type { InstituteProfile } from "./types";

/** The institute's own profile (address/phone/email) — GET /org already
 * returns it (Settings' own Institute Details tab reads the same route),
 * but nothing outside Settings was pulling it in. Printable documents
 * (receipts, payslips) need it for a real letterhead, not just the
 * institute's name. Fetched fresh per mount — small payload, and these
 * components only mount while their modal is open. */
export function useInstituteProfile(): InstituteProfile | null {
  const [profile, setProfile] = useState<InstituteProfile | null>(null);

  useEffect(() => {
    apiFetch<InstituteProfile>("/org")
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  return profile;
}
