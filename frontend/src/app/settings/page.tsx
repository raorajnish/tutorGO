"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { SkeletonRow } from "@/components/ui/Skeleton";

const InstituteDetailsTab = dynamic(
  () => import("@/components/settings/InstituteDetailsTab").then((m) => m.InstituteDetailsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const TeamTab = dynamic(
  () => import("@/components/settings/TeamTab").then((m) => m.TeamTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const SubscriptionTab = dynamic(
  () => import("@/components/settings/SubscriptionTab").then((m) => m.SubscriptionTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const MessageTemplatesTab = dynamic(
  () => import("@/components/settings/MessageTemplatesTab").then((m) => m.MessageTemplatesTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const EmailSettingsTab = dynamic(
  () => import("@/components/settings/EmailSettingsTab").then((m) => m.EmailSettingsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const WhatsAppSettingsTab = dynamic(
  () => import("@/components/settings/WhatsAppSettingsTab").then((m) => m.WhatsAppSettingsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const RemindersTab = dynamic(
  () => import("@/components/settings/RemindersTab").then((m) => m.RemindersTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const PaymentsSettingsTab = dynamic(
  () => import("@/components/settings/PaymentsSettingsTab").then((m) => m.PaymentsSettingsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);

const TABS = [
  { id: "details", label: "Institute details" },
  { id: "team", label: "Team" },
  { id: "reminders", label: "Reminders" },
  { id: "subscription", label: "Subscription" },
  { id: "messages", label: "Message templates" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "payments", label: "Payments" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("details");

  if (!user) return null;

  if (user.role === "OWNER" && !user.currentInstituteId) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold text-foreground">Settings</h1>
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Enter an institute to manage its settings.
          <div className="mt-4">
            <Link href="/dashboard">
              <Button variant="secondary">Go to dashboard</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">{user.institute?.name}</p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      <div>
        {tab === "details" && <InstituteDetailsTab />}
        {tab === "team" && <TeamTab />}
        {tab === "reminders" && <RemindersTab />}
        {tab === "subscription" && <SubscriptionTab />}
        {tab === "messages" && <MessageTemplatesTab />}
        {tab === "email" && <EmailSettingsTab />}
        {tab === "whatsapp" && <WhatsAppSettingsTab />}
        {tab === "payments" && <PaymentsSettingsTab />}
      </div>
    </div>
  );
}
