"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { InstituteDetailsTab } from "@/components/settings/InstituteDetailsTab";
import { TeamTab } from "@/components/settings/TeamTab";
import { SubscriptionTab } from "@/components/settings/SubscriptionTab";
import { MessageTemplatesTab } from "@/components/settings/MessageTemplatesTab";
import { EmailSettingsTab } from "@/components/settings/EmailSettingsTab";
import { WhatsAppSettingsTab } from "@/components/settings/WhatsAppSettingsTab";
import { RemindersTab } from "@/components/settings/RemindersTab";
import { PaymentsSettingsTab } from "@/components/settings/PaymentsSettingsTab";

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
