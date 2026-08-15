import { useMemo, useState } from "react"
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type IconName = "grid" | "chart" | "book" | "user" | "settings" | "search" | "bell" | "chev" | "plus" | "dots" | "menu" | "close" | "check"
function Icon({ name, className = "" }: { name: IconName className?: string }) {
  const p: Record<IconName, React.ReactNode> = {
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5M4 19h16" />
        <path d="m7 15 4-5 3 2 4-6" />
      </>
    ),
    book: (
      <>
        <path d="M4 5.8A2.8 2.8 0 0 1 6.8 3H20v16H6.8A2.8 2.8 0 0 0 4 21.8z" />
        <path d="M4 6v15" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20c1.2-3.3 3.7-5 7.5-5s6.3 1.7 7.5 5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5.3v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="4.5" />
        <path d="m14 14 4 4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" />
      </>
    ),
    chev: <path d="m7 9 5 5 5-5" />,
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    dots: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-[18px] w-[18px] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {p[name]}
    </svg>
  )
}
const nav = [
  ["/", "Feed", "grid"],
  ["/insights", "Insights", "chart"],
  ["/library", "Library", "book"],
  ["/collections", "Collections", "book"],
  ["/profile", "Profile", "user"],
  ["/settings", "Settings", "settings"],
] as const
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
      {children}
    </span>
  )
}
function TeamSelect() {
  const [open, setOpen] = useState(false),
    [team, setTeam] = useState("Northstar team")
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:border-primary/30"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-xs font-black text-white">
          N
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[10px]">{team}</b>
          <small className="text-[8px] text-muted-foreground">
            Product workspace
          </small>
        </span>
        <Icon
          name="chev"
          className={`text-muted-foreground transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="absolute bottom-[calc(100%+8px)] z-50 w-full rounded-xl border border-border bg-card p-1.5 shadow-[0_14px_30px_rgba(19,34,56,.16)]">
          {["Northstar team", "Bowwow Studio", "Personal workspace"].map(
            (x) => (
              <button
                key={x}
                onClick={() => {
                  setTeam(x)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] font-semibold hover:bg-secondary"
              >
                {x === team && <Icon name="check" className="text-accent" />}
                {x}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
export function AppShell() {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="flex items-center justify-between px-1">
          <NavLink
            to="/"
            className="display-face text-[23px] font-extrabold tracking-[-.09em]"
          >
            Bowwow<span className="text-accent">.</span>
          </NavLink>
          <button onClick={() => setOpen(false)} className="lg:hidden">
            <Icon name="close" />
          </button>
        </div>
        <nav className="mt-10 space-y-1">
          {nav.map(([to, label, ic]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-active" : ""}`
              }
            >
              <Icon name={ic} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-7 border-t border-border pt-6">
          <p className="px-3 text-[9px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">
            Collections
          </p>
          {["System design", "Machine learning", "Business events"].map(
            (x, i) => (
              <button
                key={x}
                className={`nav-link mt-1 ${i === 2 ? "text-accent" : ""}`}
              >
                <span className="w-[18px] text-center">
                  {["⌁", "◌", "〽"][i]}
                </span>
                {x}
              </button>
            ),
          )}
        </div>
        <div className="mt-auto">
          <TeamSelect />
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-[10px] font-bold text-white transition hover:bg-primary/90"
          >
            <Icon name="plus" />
            Create a boww
          </button>
        </div>
      </aside>
      {open && (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className={`sidebar-backdrop ${
            open ? "sidebar-backdrop-open" : ""
          } lg:hidden`}
        />
      )}
      <section className="app-main">
        <header className="topbar">
          <button
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full border border-border lg:hidden"
          >
            <Icon name="menu" />
          </button>
          <label className="relative w-full max-w-[390px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Icon name="search" />
            </span>
            <input
              placeholder="Search notes and people"
              className="top-search"
            />
          </label>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setDrawer(true)}
              className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-secondary"
              aria-label="Open notifications"
            >
              <Icon name="bell" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
            </button>
            <NavLink
              to="/profile"
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-black text-white"
            >
              E
            </NavLink>
          </div>
        </header>
        <main className="content-scroll">
          <div className="page-transition">
            <Outlet />
          </div>
        </main>
      </section>
      <NotificationDrawer open={drawer} onClose={() => setDrawer(false)} />
      <CreateBowwModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPublish={() => {
          setCreateOpen(false)
          setNote(true)
        }}
      />
      {note && (
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-[11px] font-semibold text-white shadow-xl">
          <span>All caught up—notifications are on.</span>
          <button
            onClick={() => setNote(false)}
            className="opacity-70 hover:opacity-100"
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  )
}
function CreateBowwModal({
  open,
  onClose,
  onPublish,
}: {
  open: boolean
  onClose: () => void
  onPublish: () => void
}) {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("Business events")
  const [body, setBody] = useState("")
  const [saved, setSaved] = useState(false)
  const valid = title.trim().length > 2 && body.trim().length > 8
  return (
    <div
      className={`modal-layer ${open ? "modal-open" : ""}`}
      aria-hidden={!open}
    >
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label="Close create boww"
      />
      <section
        className="create-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create a boww"
      >
        <header>
          <div>
            <p className="eyebrow">New knowledge note</p>
            <h2>Create a boww</h2>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="create-body">
          <label className="create-field">
            <span>Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your note a clear title"
            />
          </label>
          <label className="create-field">
            <span>Collection</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>Business events</option>
              <option>Machine learning</option>
              <option>System design</option>
              <option>Economics</option>
            </select>
          </label>
          <label className="create-field">
            <span>Your thought</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write something worth returning to…"
            />
          </label>
          <div className="create-options">
            <button
              onClick={() => setSaved(!saved)}
              className={saved ? "option-active" : ""}
            >
              <span>{saved ? "✓" : "○"}</span>Save as draft
            </button>
            <span>{body.length}/1000</span>
          </div>
        </div>
        <footer>
          <button onClick={onClose} className="outline-button">
            Cancel
          </button>
          <button
            onClick={onPublish}
            disabled={!valid}
            className="coral-button disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saved ? "Save draft" : "Publish boww"}
          </button>
        </footer>
      </section>
    </div>
  )
}
function NotificationDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [items, setItems] = useState([
    {
      id: 1,
      person: "Nina Fischer",
      action: "bowwed your note",
      note: "Machine learning notes",
      unread: true,
    },
    {
      id: 2,
      person: "Kaito Yamada",
      action: "saved your collection",
      note: "Event playbook",
      unread: true,
    },
    {
      id: 3,
      person: "Mila Grey",
      action: "started following you",
      note: "",
      unread: false,
    },
    {
      id: 4,
      person: "Bowwow editorial",
      action: "featured your note in",
      note: "Weekly signals",
      unread: false,
    },
  ])
  const unread = items.filter((x) => x.unread).length
  return (
    <div
      className={`drawer-layer ${open ? "drawer-open" : ""}`}
      aria-hidden={!open}
    >
      <button
        className="drawer-backdrop"
        onClick={onClose}
        aria-label="Close notifications"
      />
      <aside
        className="notification-drawer"
        role="dialog"
        aria-label="Notifications"
      >
        <header>
          <div>
            <p className="eyebrow">Activity</p>
            <h2>Notifications</h2>
          </div>
          <button onClick={onClose} className="drawer-close" aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-actions">
          <span>
            {unread ? `${unread} unread updates` : "You are all caught up"}
          </span>
          <button
            onClick={() =>
              setItems(items.map((x) => ({ ...x, unread: false })))
            }
          >
            Mark all read
          </button>
        </div>
        <div className="drawer-list">
          {items.map((x) => (
            <button
              onClick={() =>
                setItems(
                  items.map((y) =>
                    y.id === x.id ? { ...y, unread: false } : y,
                  ),
                )
              }
              className={`notification-row ${x.unread ? "unread" : ""}`}
              key={x.id}
            >
              <span className="notify-avatar">{x.person.slice(0, 1)}</span>
              <span className="flex-1 text-left">
                <b>{x.person}</b> {x.action}{" "}
                {x.note && <strong>“{x.note}”</strong>}
                <small>{x.id * 12} minutes ago</small>
              </span>
              {x.unread && <i className="notify-dot" />}
            </button>
          ))}
        </div>
        <footer>
          <Link to="/notifications" onClick={onClose}>
            View notification history <span>↗</span>
          </Link>
        </footer>
      </aside>
    </div>
  )
}
const Trend = () => (
  <ResponsiveContainer width="100%" height={210}>
    <AreaChart
      data={[
        { d: "Mon", v: 8 },
        { d: "Tue", v: 14 },
        { d: "Wed", v: 11 },
        { d: "Thu", v: 22 },
        { d: "Fri", v: 18 },
        { d: "Sat", v: 30 },
        { d: "Sun", v: 27 },
      ]}
    >
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#f26a36" stopOpacity=".32" />
          <stop offset="1" stopColor="#f26a36" stopOpacity="0" />
        </linearGradient>
      </defs>
      <XAxis
        dataKey="d"
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 9, fill: "#828e9e" }}
      />
      <YAxis hide />
      <Tooltip
        contentStyle={{
          borderRadius: 12,
          border: "1px solid #dbe3ea",
          fontSize: 11,
        }}
      />
      <Area
        type="monotone"
        dataKey="v"
        stroke="#f26a36"
        strokeWidth={2.5}
        fill="url(#area)"
      />
    </AreaChart>
  </ResponsiveContainer>
)
function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
      </div>
      {children}
    </div>
  )
}
const articles = [
  "Machine learning notes",
  "What kind of Knowledge?",
  "Employee ownership",
  "The systems behind a great event",
  "A smarter meeting brief",
  "How teams remember",
]
export function Feed() {
  const [filter, setFilter] = useState("For you"),
    [likes, setLikes] = useState(12)
  return (
    <>
      <PageTitle eyebrow="Friday, October 25" title="Your feed">
        <div className="segmented">
          {["For you", "Following"].map((x) => (
            <button
              onClick={() => setFilter(x)}
              className={filter === x ? "selected" : ""}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
      </PageTitle>
      <div className="feed-grid">
        <section className="space-y-4">
          <div className="feature-grid">
            <article className="feature-card feature-dark">
              <Pill>Machine learning</Pill>
              <h2>
                Machine
                <br />
                learning notes
              </h2>
              <p>
                A concise guide to turning observation into useful, living
                models.
              </p>
              <footer>
                <button>Read note</button>
                <button
                  onClick={() => setLikes(likes + 1)}
                  className="white-button"
                >
                  Boww · {likes}
                </button>
              </footer>
            </article>
            <article className="feature-card">
              <Pill>Business events</Pill>
              <h2>
                What kind of
                <br />
                Knowledge?
              </h2>
              <p>
                On the art of building a room where everyone leaves clearer.
              </p>
              <footer>
                <button>Read note</button>
                <button
                  onClick={() => setLikes(likes + 1)}
                  className="coral-button"
                >
                  Boww
                </button>
              </footer>
            </article>
          </div>
          <article className="wide-feature">
            <span className="watermark">e</span>
            <Pill>Economics</Pill>
            <h2>Employee ownership</h2>
            <p>Make the people who create value feel it.</p>
            <button className="dark-button">Read note</button>
          </article>
          <section className="list-panel">
            <div className="panel-head">
              <h2>From your circles</h2>
              <button>View all</button>
            </div>
            {articles.map((x, i) => (
              <button key={x} className="article-row">
                <span className={`row-mark mark-${i % 3}`}>〽</span>
                <span className="flex-1 text-left">
                  <b>{x}</b>
                  <small>
                    {
                      ["Machine learning", "Business events", "Economics"][
                        i % 3
                      ]
                    }{" "}
                    · {i + 2} min read
                  </small>
                </span>
                <span className="text-muted-foreground">↗</span>
              </button>
            ))}
          </section>
        </section>
        <aside className="right-rail">
          <ProfileMini />
          <section className="rail-card">
            <div className="panel-head">
              <h2>Weekly reading</h2>
              <button>•••</button>
            </div>
            <Trend />
          </section>
        </aside>
      </div>
    </>
  )
}
function ProfileMini() {
  return (
    <section className="profile-mini">
      <div className="avatar-lg">✦</div>
      <b>esamyna</b>
      <small>Event manager · Estonia</small>
      <p>I know how to organize events in IT and myself. Read and bowwow!</p>
      <div className="stats">
        <span>
          <b>97</b>Posts
        </span>
        <span>
          <b>3.5k</b>Followers
        </span>
        <span>
          <b>12</b>Bowws
        </span>
      </div>
    </section>
  )
}
export function Insights() {
  const [range, setRange] = useState("7 days")
  const data = useMemo(
    () =>
      range === "7 days"
        ? [
            { n: "Notes", v: 18 },
            { n: "Bowws", v: 24 },
            { n: "Saves", v: 12 },
            { n: "Follows", v: 9 },
          ]
        : [
            { n: "Notes", v: 77 },
            { n: "Bowws", v: 89 },
            { n: "Saves", v: 52 },
            { n: "Follows", v: 38 },
          ],
    [range],
  )
  return (
    <>
      <PageTitle eyebrow="Activity overview" title="Insights">
        <select
          className="select-control"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        >
          <option>7 days</option>
          <option>30 days</option>
        </select>
      </PageTitle>
      <div className="metric-grid">
        {[
          ["2,849", "Total reads", "+18.4%"],
          ["346", "New bowws", "+12.0%"],
          ["74%", "Read-through", "+4.9%"],
        ].map(([n, l, d]) => (
          <article className="metric-card" key={l}>
            <span>{l}</span>
            <b>{n}</b>
            <small>{d} this period</small>
          </article>
        ))}
      </div>
      <section className="chart-card">
        <div className="panel-head">
          <div>
            <h2>Engagement</h2>
            <p>How your ideas landed with the community.</p>
          </div>
          <Pill>{range}</Pill>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} barSize={32}>
            <CartesianGrid vertical={false} stroke="#edf1f4" />
            <XAxis
              dataKey="n"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#828e9e" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#828e9e" }}
            />
            <Tooltip
              cursor={{ fill: "#f4f7f8" }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #dbe3ea",
                fontSize: 11,
              }}
            />
            <Bar dataKey="v" radius={[8, 8, 2, 2]} fill="#132238" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </>
  )
}
export function Library() {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("Recent")
  const results = articles.filter((x) =>
    x.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <PageTitle eyebrow="Your saved knowledge" title="Library">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter library"
            className="small-input"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="select-control"
          >
            <option>Recent</option>
            <option>Popular</option>
            <option>A–Z</option>
          </select>
        </div>
      </PageTitle>
      <div className="library-list">
        {results.map((x, i) => (
          <article key={x} className="library-card">
            <span className={`library-cover cover-${i % 3}`}>
              {["ML", "BE", "ECO"][i % 3]}
            </span>
            <div>
              <Pill>
                {["Machine learning", "Business events", "Economics"][i % 3]}
              </Pill>
              <h2>{x}</h2>
              <p>Collected by esamyna · Updated this week</p>
            </div>
            <button className="more-button">
              <Icon name="dots" />
            </button>
          </article>
        ))}
        {!results.length && (
          <div className="empty">No saved notes match “{query}”.</div>
        )}
      </div>
    </>
  )
}
export function Profile() {
  const [following, setFollowing] = useState(false)
  const [active, setActive] = useState("Notes")
  const [saved, setSaved] = useState(false)
  return (
    <>
      <PageTitle eyebrow="Public profile" title="esamyna" />
      <div className="profile-page">
        <section className="profile-hero">
          <div className="avatar-xl">✦</div>
          <div>
            <Pill>Event manager · Estonia</Pill>
            <h2>I organize the kinds of rooms where ideas become useful.</h2>
            <p>
              Reading and writing about communities, events, and generous
              systems.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFollowing(!following)}
                className={following ? "outline-button" : "coral-button"}
              >
                {following ? "Following ✓" : "Follow"}
              </button>
              <button
                onClick={() => setSaved(!saved)}
                className="outline-button"
              >
                {saved ? "Saved ✓" : "Save profile"}
              </button>
            </div>
          </div>
        </section>
        <section className="chart-card">
          <div className="panel-head">
            <h2>Reader growth</h2>
            <Pill>Last 7 days</Pill>
          </div>
          <Trend />
        </section>
      </div>
      <section className="profile-details">
        <div className="profile-tabs">
          {["Notes", "Collections", "About"].map((x) => (
            <button
              key={x}
              onClick={() => setActive(x)}
              className={active === x ? "tab-active" : ""}
            >
              {x}
            </button>
          ))}
        </div>
        {active === "Notes" && (
          <div className="note-grid">
            {articles.slice(0, 4).map((x, i) => (
              <article className="note-tile" key={x}>
                <Pill>
                  {
                    [
                      "Machine learning",
                      "Business events",
                      "Economics",
                      "System design",
                    ][i]
                  }
                </Pill>
                <h3>{x}</h3>
                <p>
                  {["312 reads", "189 reads", "94 reads", "67 reads"][i]} ·{" "}
                  {i + 2} days ago
                </p>
              </article>
            ))}
          </div>
        )}
        {active === "Collections" && (
          <div className="collection-list">
            {[
              "Event playbook",
              "Thinking in systems",
              "The useful meeting",
            ].map((x, i) => (
              <article key={x} className="collection-row">
                <span className={`collection-icon ci-${i}`}>{i + 6}</span>
                <div>
                  <h3>{x}</h3>
                  <p>{["12", "8", "15"][i]} saved notes · curated by esamyna</p>
                </div>
                <button className="outline-button">Open</button>
              </article>
            ))}
          </div>
        )}
        {active === "About" && (
          <article className="bio-panel">
            <h3>About esamyna</h3>
            <p>
              I work with people who care about creating meaningful, well-run
              gatherings. My notes are equal parts practical playbook and a
              place to think out loud.
            </p>
            <div className="profile-tags">
              <Pill>Community</Pill>
              <Pill>Event design</Pill>
              <Pill>Knowledge work</Pill>
            </div>
            <div className="bio-stats">
              <span>
                <b>2019</b>Joined Bowwow
              </span>
              <span>
                <b>14</b>Collections
              </span>
              <span>
                <b>42</b>Notes published
              </span>
            </div>
          </article>
        )}
      </section>
    </>
  )
}
export function Settings() {
  const [email, setEmail] = useState(true),
    [digest, setDigest] = useState(false),
    [privateMode, setPrivate] = useState(false)
  const Toggle = ({
    label,
    value,
    onChange,
    desc,
  }: {
    label: string
    value: boolean
    onChange: () => void
    desc: string
  }) => (
    <button onClick={onChange} className="setting-row">
      <span>
        <b>{label}</b>
        <small>{desc}</small>
      </span>
      <span className={`toggle ${value ? "toggle-on" : ""}`}>
        <i />
      </span>
    </button>
  )
  return (
    <>
      <PageTitle eyebrow="Workspace and preferences" title="Settings" />
      <section className="settings-panel">
        <h2>Notifications</h2>
        <Toggle
          label="Email notifications"
          desc="Important activity and mentions"
          value={email}
          onChange={() => setEmail(!email)}
        />
        <Toggle
          label="Weekly digest"
          desc="A Monday reading recap"
          value={digest}
          onChange={() => setDigest(!digest)}
        />
      </section>
      <section className="settings-panel">
        <h2>Privacy</h2>
        <Toggle
          label="Private profile"
          desc="Only your followers can view your notes"
          value={privateMode}
          onChange={() => setPrivate(!privateMode)}
        />
        <label className="setting-field">
          Display name
          <input defaultValue="esamyna" />
        </label>
        <button className="dark-button mt-5">Save changes</button>
      </section>
    </>
  )
}
export function Notifications() {
  const [items, setItems] = useState([
    {
      id: 1,
      person: "Nina Fischer",
      action: "bowwed your note",
      note: "Machine learning notes",
      unread: true,
    },
    {
      id: 2,
      person: "Kaito Yamada",
      action: "saved your collection",
      note: "Event playbook",
      unread: true,
    },
    {
      id: 3,
      person: "Mila Grey",
      action: "started following you",
      note: "",
      unread: false,
    },
    {
      id: 4,
      person: "Bowwow editorial",
      action: "featured your note in",
      note: "Weekly signals",
      unread: false,
    },
  ])
  const [filter, setFilter] = useState("All")
  const unread = items.filter((x) => x.unread).length
  const shown = filter === "Unread" ? items.filter((x) => x.unread) : items
  return (
    <>
      <PageTitle eyebrow="Activity" title="Notifications">
        <button
          onClick={() => setItems(items.map((x) => ({ ...x, unread: false })))}
          className="outline-button"
        >
          Mark all as read{unread ? ` (${unread})` : ""}
        </button>
      </PageTitle>
      <section className="notification-summary">
        <div>
          <span className="summary-number">{unread}</span>
          <p>unread updates waiting for you</p>
        </div>
        <div className="segmented">
          {["All", "Unread"].map((x) => (
            <button
              key={x}
              onClick={() => setFilter(x)}
              className={filter === x ? "selected" : ""}
            >
              {x}
            </button>
          ))}
        </div>
      </section>
      <section className="notification-panel">
        <div className="notification-panel-head">
          <span>Today</span>
          <span>{shown.length} updates</span>
        </div>
        {shown.length ? (
          shown.map((x) => (
            <button
              onClick={() =>
                setItems(
                  items.map((y) =>
                    y.id === x.id ? { ...y, unread: false } : y,
                  ),
                )
              }
              className={`notification-row ${x.unread ? "unread" : ""}`}
              key={x.id}
            >
              <span className="notify-avatar">{x.person.slice(0, 1)}</span>
              <span className="flex-1 text-left">
                <b>{x.person}</b> {x.action}{" "}
                {x.note && <strong>“{x.note}”</strong>}
                <small>{x.id * 12} minutes ago</small>
              </span>
              {x.unread && <i className="notify-dot" />}
            </button>
          ))
        ) : (
          <div className="notification-empty">
            <span>✓</span>
            <b>Nothing unread</b>
            <p>Your notification inbox is up to date.</p>
          </div>
        )}
      </section>
    </>
  )
}
export function Collections() {
  const [filter, setFilter] = useState("All")
  const [following, setFollowing] = useState<number[]>([])
  const collections = [
    { name: "Event playbook", count: 12, kind: "Work" },
    { name: "Thinking in systems", count: 8, kind: "Learning" },
    { name: "Creative rituals", count: 14, kind: "Personal" },
    { name: "People who build", count: 9, kind: "Work" },
    { name: "Field notes", count: 6, kind: "Personal" },
    { name: "Model library", count: 11, kind: "Learning" },
  ]
  const shown =
    filter === "All"
      ? collections
      : collections.filter((x) => x.kind === filter)
  const toggle = (i: number) =>
    setFollowing((v) => (v.includes(i) ? v.filter((x) => x !== i) : [...v, i]))
  return (
    <>
      <PageTitle eyebrow="Organized knowledge" title="Collections">
        <div className="segmented">
          {["All", "Work", "Learning", "Personal"].map((x) => (
            <button
              key={x}
              className={filter === x ? "selected" : ""}
              onClick={() => setFilter(x)}
            >
              {x}
            </button>
          ))}
        </div>
      </PageTitle>
      <section className="collection-grid">
        {shown.map((x, i) => (
          <article key={x.name} className="collection-card">
            <div className={`collection-art art-${i % 3}`}>
              <span>{String(x.count).padStart(2, "0")}</span>
            </div>
            <Pill>{x.kind}</Pill>
            <Link
              to={`/collections/${x.name.toLowerCase().replaceAll(" ", "-")}`}
            >
              <h2>{x.name}</h2>
            </Link>
            <p>{x.count} notes · Updated this week</p>
            <footer>
              <span className="collection-people">◉ ◉ ◉</span>
              <button
                onClick={() => toggle(i)}
                className={
                  following.includes(i) ? "outline-button" : "coral-button"
                }
              >
                {following.includes(i) ? "Following" : "Follow"}
              </button>
            </footer>
          </article>
        ))}
      </section>
    </>
  )
}
export function CollectionDetail() {
  const { slug } = useParams()
  const n = useNavigate()
  const title = (slug || "collection")
    .split("-")
    .map((x) => x[0]?.toUpperCase() + x.slice(1))
    .join(" ")
  const [subscribed, setSubscribed] = useState(false)
  const entries = [
    "Writing a brief that people actually use",
    "The quiet mechanics of a great workshop",
    "A checklist for the day before",
    "What to do with feedback while it is still fresh",
    "A generous follow-up note",
  ]
  return (
    <>
      <button onClick={() => n("/collections")} className="back-button">
        ← Collections
      </button>
      <PageTitle eyebrow="Curated collection" title={title}>
        <button
          onClick={() => setSubscribed(!subscribed)}
          className={subscribed ? "outline-button" : "coral-button"}
        >
          {subscribed ? "Following ✓" : "Follow collection"}
        </button>
      </PageTitle>
      <section className="collection-detail-hero">
        <span>12</span>
        <div>
          <Pill>Work</Pill>
          <h2>
            Ideas and practical notes for people who make gatherings matter.
          </h2>
          <p>Curated by esamyna · Updated Thursday</p>
        </div>
      </section>
      <section className="detail-notes">
        <div className="panel-head">
          <h2>Notes in this collection</h2>
          <Pill>12 notes</Pill>
        </div>
        {entries.map((x, i) => (
          <article className="detail-note" key={x}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3>{x}</h3>
              <p>esamyna · {i + 3} min read · Updated this month</p>
            </div>
            <button className="outline-button">Read</button>
          </article>
        ))}
      </section>
    </>
  )
}
export function NotFound() {
  const n = useNavigate()
  return (
    <div className="empty">
      <h1 className="page-title">Not found</h1>
      <button onClick={() => n("/")} className="coral-button mt-4">
        Return home
      </button>
    </div>
  )
}
