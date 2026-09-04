import { useRef, useState, type ReactNode, type UIEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Image,
  Link,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Filter,
  GraduationCap,
  Home,
  LayoutGrid,
  Medal,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

type Screen = "welcome" | "home" | "classes" | "calendar" | "profile" | "system" | "test-detail" | "homework-detail";

const navItems: { id: Screen; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "classes", label: "Classes", icon: BookOpen },
  { id: "profile", label: "Profile", icon: CircleUserRound },
];

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>{action && <button className="text-[10px] text-muted-foreground transition hover:text-foreground">{action}</button>}</div>;
}

function IconBadge({ icon: Icon, dark = false, small = false }: { icon: typeof Home; dark?: boolean; small?: boolean }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-[10px] ${small ? "size-7" : "size-9"} ${dark ? "bg-white/14 text-white" : "border border-border bg-[#f7f6f3] text-foreground"}`}><Icon size={small ? 13 : 16} strokeWidth={1.8} /></span>;
}

function BottomNav({ active, onChange }: { active: Screen; onChange: (page: Screen) => void }) {
  const items = navItems;
  return <div className="absolute bottom-5 left-1/2 z-20 flex h-[52px] w-[244px] -translate-x-1/2 items-center justify-between rounded-full border border-[#deddd9] bg-white px-2 shadow-[0_9px_30px_rgba(15,15,15,0.08)]">
    {items.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} onClick={() => onChange(id)} className={`grid size-9 place-items-center rounded-full transition-all ${active === id ? "bg-[#1a1a1a] text-white shadow-sm" : "text-[#737373] hover:bg-[#f2f1ee] hover:text-foreground"}`}><Icon size={17} strokeWidth={active === id ? 2.2 : 1.75} /></button>)}
  </div>;
}

function LineIllustration() {
  return <div className="relative mx-auto flex h-[255px] w-[275px] items-center justify-center overflow-visible">
    <Sparkles className="absolute left-4 top-8" size={18} strokeWidth={1.5} /><Star className="absolute right-8 top-14" size={13} strokeWidth={1.5} /><Sparkles className="absolute bottom-7 right-2" size={17} strokeWidth={1.5} />
    <svg viewBox="0 0 260 220" className="h-full w-full text-[#1a1a1a]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M55 182c18-12 36-12 53 1m44-2c12-10 27-11 41-2M38 191c48 10 129 10 185 0" opacity=".75" />
      <circle cx="132" cy="64" r="28" />
      <path d="M112 61c2-14 12-24 24-24 13 0 24 9 25 21m-14-25c-6-12-21-15-31-9m3 19c-9-5-18-1-22 8m61-3c10-8 23-5 27 4 4 8-2 16-9 17" />
      <path d="M120 63h3m22 0h3M128 75c4 3 9 3 13 0" />
      <path d="M111 94c-14 8-23 21-25 39l-4 40m68-79c11 8 19 21 19 38l-1 25" />
      <path d="M87 127l-27 18 9 12 29-15m72-16 28 14-7 14-29-13" />
      <path d="M110 107l39 2 7 48-47-2z" fill="white" />
      <path d="M116 120l30 2m-30 9 30 2m-27 10 21 1" opacity=".65" />
      <path d="M105 153c-17 3-31 11-35 24-2 7 4 11 12 8l29-13m43-15c16 6 25 16 30 27 3 7-4 12-11 8l-27-15" />
      <path d="M93 170l-18 25m78-27 20 28" />
      <path d="M71 196c-4 8 6 11 14 5m83-5c7 7 18 4 13-5" />
      <path d="M70 91c-10 1-13 10-5 14m127-20c9 0 13 8 7 13M54 118l-8 5m9 12-10 3M201 109l9-4m-6 18 10 2" opacity=".75" />
    </svg>
  </div>;
}

function Welcome({ onStart }: { onStart: () => void }) {
  return <div className="flex h-full flex-col px-7 pb-8 pt-9"><div className="flex items-center gap-2"><span className="size-5 rounded-full bg-[#1a1a1a]"/><span className="text-[9px] font-bold leading-[1.05]">Student's<br/>App</span></div><h1 className="mt-5 max-w-[240px] font-display text-[31px] font-semibold leading-[1.04] tracking-[-0.04em]">Get your grades<br/>to the next level</h1><div className="flex flex-1 items-center"><LineIllustration /></div><button onClick={onStart} className="flex h-[50px] w-full items-center justify-center rounded-full bg-[#1a1a1a] text-[13px] font-semibold text-white transition hover:scale-[1.015] hover:bg-black active:scale-[.99]">Let's go!</button></div>;
}

function HomeScreen() {
  const small = [
    { label: "Attendance score", value: "97%", icon: CheckSquare },
    { label: "Average grade", value: "10", icon: Medal },
    { label: "Classes today", value: "6", icon: BookOpen },
  ];
  return <div className="px-6 pb-24 pt-8"><h1 className="font-display text-[29px] font-semibold leading-none tracking-[-.035em]">Home</h1><div className="mt-5 flex items-center justify-between"><p className="text-[13px] font-semibold">Dashboard</p><button className="text-[10px] text-muted-foreground">Edit</button></div><div className="mt-3 grid grid-cols-2 gap-2.5"><div className="flex h-[116px] flex-col justify-between rounded-[20px] bg-[#1a1a1a] p-4 text-white"><IconBadge icon={CheckSquare} dark small/><div><p className="text-[9px] text-white/65">Homework to do</p><p className="mt-0.5 font-display text-[27px] font-semibold leading-none">2</p></div></div>{small.map(({ label, value, icon: Icon }) => <div key={label} className="flex h-[116px] flex-col justify-between rounded-[20px] border border-border bg-white p-4"><IconBadge icon={Icon} small/><div><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-0.5 font-display text-[24px] font-semibold leading-none">{value}</p></div></div>)}</div><div className="mt-2.5 rounded-[20px] bg-[#1a1a1a] p-4 text-white"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><IconBadge icon={CalendarDays} dark small/><span className="text-[10px] text-white/65">Next class today</span></div><MoreHorizontal size={17} className="text-white/60"/></div><div className="mt-6 grid grid-cols-[1fr_auto] gap-4"><p className="font-display text-[24px] font-semibold leading-none">Biology</p><div className="text-right"><p className="text-[14px] font-semibold leading-none">13:25–14:05</p><p className="mt-1 text-[9px] text-white/60">204 classroom</p></div></div></div></div>;
}

function ClassesScreen({ onOpenHomework }: { onOpenHomework: (subject: string) => void }) {
  const [tab, setTab] = useState<"classes" | "grades">("classes");
  const tasks: [string, typeof CheckSquare][] = [["Geometry", CheckSquare], ["Chemistry", BookOpen]];
  return <div className="px-6 pb-24 pt-8"><div className="flex gap-3"><button onClick={() => setTab("classes")} className={`font-display text-[26px] font-semibold tracking-[-.04em] ${tab === "classes" ? "text-foreground" : "text-[#d5d4d1]"}`}>Classes</button><button onClick={() => setTab("grades")} className={`font-display text-[26px] font-semibold tracking-[-.04em] ${tab === "grades" ? "text-foreground" : "text-[#d5d4d1]"}`}>Grades</button></div>{tab === "classes" ? <><div className="mt-5"><SectionTitle title="Homework to do" action="See history"/><div className="space-y-2">{tasks.map(([subject, Icon]) => <button key={subject} onClick={() => onOpenHomework(subject)} className="flex w-full items-center gap-3 rounded-[15px] bg-[#1a1a1a] p-3 text-left text-white transition hover:scale-[1.01]"><IconBadge icon={Icon} dark small/><div className="flex-1"><p className="text-[9px] text-white/60">Due tomorrow · 2 attachments</p><p className="font-display text-[19px] font-semibold leading-[1.1]">{subject}</p></div><ChevronRight size={17} className="text-white/60"/></button>)}</div></div><div className="mt-5"><SectionTitle title="All" action="Sort by⌄"/><label className="flex h-9 items-center gap-2 rounded-[11px] bg-[#f0efec] px-3 text-muted-foreground"><Search size={14}/><input placeholder="Search..." className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"/></label><button className="mt-2 flex w-full items-center gap-3 rounded-[15px] border border-border bg-white p-3 text-left"><IconBadge icon={Medal} small/><div className="flex-1"><p className="text-[9px] text-muted-foreground">Average grade</p><p className="font-display text-[19px] font-semibold leading-[1.1]">Algebra</p></div><ChevronRight size={16}/></button></div></> : <div className="mt-7 space-y-2">{["Algebra", "Geometry", "Biology", "Chemistry"].map((subject, index) => <div key={subject} className="flex items-center gap-3 rounded-[16px] border border-border bg-white p-3"><IconBadge icon={Medal} small/><p className="flex-1 font-display text-[18px] font-semibold">{subject}</p><p className="font-display text-[21px] font-semibold">{[10, 9, 10, 8][index]}</p></div>)}</div>}</div>;
}

const tests = [
  { subject: "Geography", kind: "Discussion", date: "Tomorrow, 10:00", day: 12, icon: Trophy },
  { subject: "Chemistry", kind: "Chapter test", date: "Wed, 09:15", day: 16, icon: Sparkles },
];
const pastTests = [
  ["Biology", "Cell structure", "8 July", "9"], ["Algebra", "Equations", "3 July", "10"], ["English", "Reading analysis", "25 June", "9"], ["History", "Industrial revolution", "18 June", "8"],
];

function CalendarScreen({ onOpenTest }: { onOpenTest: (subject: string) => void }) {
  const [mode, setMode] = useState<"month" | "week">("month");
  const [open, setOpen] = useState(false);
  const [compressed, setCompressed] = useState(false);
  const scrollFrame = useRef<number | null>(null);
  const dates = Array.from({ length: 35 }, (_, i) => i < 2 ? 0 : i - 1);
  const shownDates = mode === "week" ? [7, 8, 9, 10, 11, 12, 13] : dates;
  const testDates = new Set(tests.map((test) => test.day));
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => setCompressed((current) => top > 88 ? true : top < 30 ? false : current));
  };
  return <div onScroll={handleScroll} style={{ WebkitOverflowScrolling: "touch" }} className="h-full touch-pan-y overflow-y-auto overscroll-y-contain px-6 pb-32 pt-8 [scrollbar-width:none]"><div className="sticky top-0 z-20 -mx-6 bg-background/95 px-6 pb-3 pt-0 backdrop-blur-md"><h1 className="font-display text-[29px] font-semibold leading-none tracking-[-.035em]">Calendar</h1><div className="mt-5 flex items-center justify-between"><div className="relative"><button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-[10px] font-semibold capitalize">{mode} <ChevronDown size={12}/></button><AnimatePresence>{open && <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute left-0 top-9 z-30 w-[90px] rounded-[14px] border border-border bg-white p-1 shadow-[0_12px_25px_rgba(0,0,0,.09)]">{(["month", "week"] as const).map((option) => <button key={option} onClick={() => { setMode(option); setOpen(false); }} className={`w-full rounded-[10px] px-2 py-2 text-left text-[10px] capitalize ${mode === option ? "bg-[#1a1a1a] text-white" : "hover:bg-[#f1f0ed]"}`}>{option}</button>)}</motion.div>}</AnimatePresence></div><button className="grid size-8 place-items-center rounded-full bg-[#eeece8]"><SlidersHorizontal size={14}/></button></div><AnimatePresence initial={false}>{compressed && <motion.div initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -8, height: 0 }} transition={{ duration: .2, ease: "easeOut" }} className="overflow-hidden"><div className="mt-3 flex items-center justify-between rounded-[14px] border border-border bg-white px-3 py-2"><span className="text-[10px] text-muted-foreground">July 8–14</span><div className="flex gap-1">{[8, 9, 10, 11, 12, 13, 14].map((day) => <span key={day} className={`grid size-5 place-items-center rounded-full text-[8px] ${day === 11 ? "bg-[#1a1a1a] text-white" : day === 12 ? "bg-[#deddda] ring-1 ring-[#bdbcb7]" : ""}`}>{day}</span>)}</div></div></motion.div>}</AnimatePresence></div><motion.div animate={{ opacity: compressed ? 0 : 1, height: compressed ? 0 : "auto", marginTop: compressed ? 0 : 4 }} transition={{ duration: .22, ease: "easeOut" }} className={`overflow-hidden ${compressed ? "pointer-events-none" : ""}`}><div className="grid grid-cols-7 gap-y-2 text-center">{"MTWTFSS".split("").map((day, i) => <span key={i} className="text-[9px] font-semibold text-muted-foreground">{day}</span>)}{shownDates.map((date, i) => <div key={i} className="relative mx-auto grid size-7 place-items-center">{date > 0 && <button className={`grid size-7 place-items-center rounded-full text-[10px] transition ${date === 11 ? "bg-[#1a1a1a] font-semibold text-white" : testDates.has(date) ? "bg-[#deddda] font-semibold text-[#1a1a1a] ring-1 ring-[#bdbcb7]" : "text-[#333] hover:bg-[#ecebe7]"}`}>{date}</button>}{testDates.has(date) && <span className="absolute bottom-[-1px] size-1 rounded-full bg-[#1a1a1a]"/>}</div>)}</div><div className="mt-3 flex items-center gap-3 text-[9px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#1a1a1a]"/>Today</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#deddda] ring-1 ring-[#bdbcb7]"/>Test date</span></div></motion.div><section className={`transition-[margin] duration-200 ${compressed ? "mt-4" : "mt-6"}`}><SectionTitle title="Upcoming tests" action="Sort by⌄"/><div className="space-y-2">{tests.map((test) => <button onClick={() => onOpenTest(test.subject)} className="flex w-full items-center gap-3 rounded-[15px] border border-border bg-white p-3 text-left transition hover:border-[#aaa9a4]" key={test.subject}><IconBadge icon={test.icon} small/><div className="flex-1"><p className="text-[12px] font-semibold">{test.subject}</p><p className="text-[9px] text-muted-foreground">{test.kind}</p></div><p className="text-right text-[9px] text-muted-foreground">{test.date}</p><ChevronRight size={13} className="text-muted-foreground"/></button>)}</div></section><section className="mt-7"><SectionTitle title="Past tests" action="All history"/><div className="space-y-2">{pastTests.map(([subject, topic, date, grade]) => <div key={subject} className="flex items-center gap-3 rounded-[15px] border border-border bg-white p-3"><IconBadge icon={FileText} small/><div className="flex-1"><p className="text-[12px] font-semibold">{subject}</p><p className="text-[9px] text-muted-foreground">{topic} · {date}</p></div><p className="font-display text-[19px] font-semibold">{grade}</p></div>)}</div></section></div>;
}

function TestDetail({ subject, onBack }: { subject: string; onBack: () => void }) {
  const chemistry = subject === "Chemistry";
  return <div className="h-full overflow-y-auto px-6 pb-10 pt-8 [scrollbar-width:none]"><button onClick={onBack} aria-label="Back" className="grid size-8 place-items-center rounded-full border border-border bg-white transition hover:bg-[#f0efec]"><ArrowLeft size={16}/></button><p className="mt-7 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Upcoming assessment</p><h1 className="mt-2 font-display text-[32px] font-semibold leading-[.95] tracking-[-.04em]">{subject}<br/>{chemistry ? "chapter test" : "discussion"}</h1><div className="mt-6 rounded-[20px] bg-[#1a1a1a] p-4 text-white"><div className="flex items-center justify-between"><p className="text-[10px] text-white/60">Date & time</p><Clock3 size={15} className="text-white/60"/></div><p className="mt-3 font-display text-[24px] font-semibold">{chemistry ? "16 July" : "12 July"}</p><p className="text-[11px] text-white/65">{chemistry ? "09:15–10:00" : "10:00–10:45"} · Room 204</p></div><div className="mt-6"><SectionTitle title="What to prepare"/><div className="rounded-[18px] border border-border bg-white p-4"><p className="text-[12px] font-semibold">{chemistry ? "Atomic structure & bonding" : "Climate zones and ecosystems"}</p><p className="mt-1 text-[10px] leading-[1.45] text-muted-foreground">Bring your course notebook and revise the listed chapters before the assessment.</p><div className="mt-4 flex flex-wrap gap-2">{(chemistry ? ["Ch. 3 — Atoms", "Ch. 4 — Bonds", "Ch. 5 — Reactions"] : ["Ch. 2 — Climate", "Ch. 3 — Biomes", "Map notes"]).map((chapter) => <span key={chapter} className="rounded-full bg-[#efeeeb] px-2.5 py-1 text-[9px] font-semibold">{chapter}</span>)}</div></div></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-[17px] border border-border bg-white p-3"><p className="text-[9px] text-muted-foreground">Duration</p><p className="mt-2 font-display text-[20px] font-semibold">45 min</p></div><div className="rounded-[17px] border border-border bg-white p-3"><p className="text-[9px] text-muted-foreground">Total marks</p><p className="mt-2 font-display text-[20px] font-semibold">20 pts</p></div></div><div className="mt-5 rounded-[18px] border border-border bg-white p-4"><p className="text-[11px] font-semibold">Teacher note</p><p className="mt-1 text-[10px] leading-[1.45] text-muted-foreground">Read each prompt carefully. You will have five minutes at the end to review your answers.</p></div></div>;
}

function HomeworkDetail({ subject, onBack }: { subject: string; onBack: () => void }) {
  const [opened, setOpened] = useState<string | null>(null);
  const resources = [["Brief & instructions", "PDF · 2.4 MB", FileText], ["Reference diagram", "Image · PNG", Image], ["Practice materials", "External link", Link]] as const;
  return <div className="h-full overflow-y-auto px-6 pb-10 pt-8 [scrollbar-width:none]"><button onClick={onBack} aria-label="Back" className="grid size-8 place-items-center rounded-full border border-border bg-white transition hover:bg-[#f0efec]"><ArrowLeft size={16}/></button><p className="mt-7 text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Homework · due tomorrow</p><h1 className="mt-2 font-display text-[32px] font-semibold leading-[.95] tracking-[-.04em]">{subject}<br/>assignment</h1><div className="mt-6 rounded-[20px] bg-[#1a1a1a] p-4 text-white"><p className="text-[10px] text-white/60">Your task</p><p className="mt-2 text-[13px] font-semibold leading-[1.35]">Complete the worksheet and add your final calculations to the last page.</p><p className="mt-4 text-[10px] text-white/60">Estimated time · 35 minutes</p></div><div className="mt-6"><SectionTitle title="Attachments"/><div className="space-y-2">{resources.map(([name, meta, Icon]) => <button onClick={() => setOpened(name)} className="flex w-full items-center gap-3 rounded-[15px] border border-border bg-white p-3 text-left transition hover:border-[#aaa9a4]" key={name}><IconBadge icon={Icon} small/><div className="flex-1"><p className="text-[12px] font-semibold">{name}</p><p className="text-[9px] text-muted-foreground">{meta}</p></div>{Icon === Link ? <ExternalLink size={14} className="text-muted-foreground"/> : <Download size={14} className="text-muted-foreground"/>}</button>)}</div></div><AnimatePresence>{opened && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-5 rounded-[18px] border border-border bg-white p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold">Previewing {opened}</p><button onClick={() => setOpened(null)} className="text-[9px] text-muted-foreground">Close</button></div><div className="mt-3 grid h-20 place-items-center rounded-[12px] bg-[#f0efec] text-[10px] text-muted-foreground">Attachment ready to open</div></motion.div>}</AnimatePresence><div className="mt-5 rounded-[18px] border border-border bg-white p-4"><p className="text-[11px] font-semibold">Submission</p><p className="mt-1 text-[10px] leading-[1.45] text-muted-foreground">Hand in your completed worksheet in class, or upload a scan before 08:30 tomorrow.</p></div></div>;
}

function ProfileScreen({ onBack }: { onBack: () => void }) {
  const achievements = [["Punctual", "You have not missed a single lesson in a month. Just how?", Trophy], ["Excellent Pupil", "You completed all your homework of the entire term!", Star], ["Made of Alien Energy", "Your GPA has reached 10. You are a mad man!", Sparkles]];
  return <div className="h-full overflow-y-auto px-6 pb-24 pt-8 [scrollbar-width:none]"><div className="relative flex items-center justify-center"><button onClick={onBack} className="absolute left-0 grid size-8 place-items-center rounded-full hover:bg-[#ecebe7]"><ArrowLeft size={18}/></button><h1 className="font-display text-[24px] font-semibold tracking-[-.03em]">Profile</h1></div><div className="mt-7 flex flex-col items-center"><div className="grid size-[70px] place-items-center rounded-full border border-border bg-[#e9e8e4] font-display text-[25px] font-semibold">JD</div><p className="mt-3 font-display text-[19px] font-semibold">James Dean</p><p className="text-[10px] text-muted-foreground">Grade 9</p></div><div className="mt-6 rounded-[18px] border border-border bg-white p-3"><div className="flex items-center gap-3"><IconBadge icon={CircleUserRound} small/><div><p className="text-[9px] text-muted-foreground">Email</p><p className="text-[11px] font-semibold">james.dean@students.app</p></div></div><div className="mt-3 flex items-center gap-3 border-t border-border pt-3"><IconBadge icon={Bell} small/><div><p className="text-[9px] text-muted-foreground">Phone</p><p className="text-[11px] font-semibold">+1 202 555 0139</p></div></div></div><div className="mt-7"><SectionTitle title="Achievements" action="See all"/><div className="space-y-3">{achievements.map(([title, copy, Icon]) => <div className="flex gap-3" key={title as string}><IconBadge icon={Icon as typeof Home}/><div><p className="text-[12px] font-semibold">{title as string}</p><p className="mt-0.5 max-w-[215px] text-[9px] leading-[1.35] text-muted-foreground">{copy as string}</p></div></div>)}</div></div></div>;
}

function SystemScreen() {
  const token = [["Canvas", "#F7F6F3", "bg-[#f7f6f3]"], ["Ink", "#1A1A1A", "bg-[#1a1a1a]"], ["Surface", "#FFFFFF", "bg-white"], ["Rule", "#E1E0DC", "bg-[#e1e0dc]"]];
  return <div className="h-full overflow-y-auto px-6 pb-9 pt-8 [scrollbar-width:none]"><div className="flex items-center gap-2"><LayoutGrid size={16}/><p className="text-[10px] font-bold uppercase tracking-[.16em]">Foundations</p></div><h1 className="mt-3 font-display text-[28px] font-semibold leading-[.95] tracking-[-.045em]">The Student's<br/>App system.</h1><p className="mt-3 text-[11px] leading-[1.45] text-muted-foreground">A quiet interface built from rounded geometry, restrained ink, and a generous rhythm.</p><SectionTitle title="Color tokens"/><div className="grid grid-cols-2 gap-2">{token.map(([name, hex, color]) => <div key={name} className="rounded-[15px] border border-border bg-white p-2.5"><span className={`block h-10 rounded-[10px] border border-black/5 ${color}`}/><p className="mt-2 text-[10px] font-semibold">{name}</p><p className="text-[8px] text-muted-foreground">{hex}</p></div>)}</div><div className="mt-6"><SectionTitle title="Type & components"/><div className="rounded-[18px] border border-border bg-white p-4"><p className="font-display text-[24px] font-semibold leading-none">Display serif</p><p className="mt-1 text-[10px] text-muted-foreground">Fraunces · 600–700</p><p className="mt-4 text-[12px] font-semibold">Body & labels</p><p className="text-[10px] text-muted-foreground">DM Sans · 400–700</p><div className="mt-4 flex gap-2"><span className="rounded-full bg-[#1a1a1a] px-4 py-2 text-[10px] font-semibold text-white">Primary</span><span className="rounded-full border border-border px-4 py-2 text-[10px] font-semibold">Outline</span></div></div></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-[18px] bg-[#1a1a1a] p-4 text-white"><p className="text-[9px] text-white/60">Radius</p><p className="mt-4 font-display text-[24px]">20px</p></div><div className="rounded-[18px] border border-border bg-white p-4"><p className="text-[9px] text-muted-foreground">Spacing</p><p className="mt-4 font-display text-[24px]">8pt</p></div></div></div>;
}

function Phone({ screen, onChange, detailSubject, onOpenHomework, onOpenTest }: { screen: Screen; onChange: (s: Screen) => void; detailSubject: string; onOpenHomework: (subject: string) => void; onOpenTest: (subject: string) => void }) {
  const pages: Record<Screen, ReactNode> = { welcome: <Welcome onStart={() => onChange("home")}/>, home: <HomeScreen/>, classes: <ClassesScreen onOpenHomework={onOpenHomework}/>, calendar: <CalendarScreen onOpenTest={onOpenTest}/>, profile: <ProfileScreen onBack={() => onChange("home")}/>, system: <SystemScreen/>, "test-detail": <TestDetail subject={detailSubject} onBack={() => onChange("calendar")}/>, "homework-detail": <HomeworkDetail subject={detailSubject} onBack={() => onChange("classes")}/> };
  const showNav = !["welcome", "system", "test-detail", "homework-detail"].includes(screen);
  return <main className="relative h-[700px] w-[360px] max-w-full overflow-hidden rounded-[30px] border border-[#e3e2de] bg-background shadow-[0_22px_60px_rgba(25,25,25,.13)] sm:h-[720px] sm:w-[390px]"><AnimatePresence mode="wait"><motion.div key={screen + detailSubject} initial={{ opacity: 0, x: 16, scale: .985 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -16, scale: .985 }} transition={{ duration: .24, ease: "easeOut" }} className="h-full">{pages[screen]}</motion.div></AnimatePresence>{showNav && <BottomNav active={screen} onChange={onChange}/>}</main>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [detailSubject, setDetailSubject] = useState("Geography");
  const openHomework = (subject: string) => { setDetailSubject(subject); setScreen("homework-detail"); };
  const openTest = (subject: string) => { setDetailSubject(subject); setScreen("test-detail"); };
  return <div className="flex min-h-screen items-center justify-center bg-background p-0 font-sans text-foreground sm:p-5"><Phone screen={screen} onChange={setScreen} detailSubject={detailSubject} onOpenHomework={openHomework} onOpenTest={openTest}/></div>;
}
