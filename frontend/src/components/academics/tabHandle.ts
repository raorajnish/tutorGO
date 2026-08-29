/** What AcademicsPage needs from whichever tab is currently active, so its
 * single page-level "New X" button (matching Enquiries/Admissions) can open
 * the right tab's create modal without that tab lifting all of its state up. */
export interface AcademicsTabHandle {
  openCreate: () => void;
}
