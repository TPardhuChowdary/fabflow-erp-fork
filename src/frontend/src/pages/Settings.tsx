import {
  DEFAULT_VOICE_LANGUAGE,
  SUPPORTED_VOICE_LANGUAGES,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
} from "@/agent/voice";
import { ConnectEmailAccountDialog } from "@/components/email/ConnectEmailAccountDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type WriteResult as EmailWriteResult,
  disconnectEmailAccount,
  listEmailAccounts,
  syncEmailAccount,
  updateEmailAccountSettings,
} from "@/lib/emailAccountsApi";
import {
  AlertTriangle,
  Archive,
  Bot,
  Building2,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit2,
  Eye,
  History,
  Info,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  Monitor,
  Moon,
  Palette,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Star,
  Sun,
  Unplug,
  UserCog,
  Users,
  Volume2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";
import { CompanyProfilePrintView } from "../components/CompanyProfilePrintView";
import { ThemePreviewCard } from "../components/ThemePreviewCard";
import {
  type MigrationItemResult,
  type MigrationReport,
  migrateDrawingRepositoryToSupabase,
} from "../drawingEditor/lib/migrateToSupabase";
import {
  type RecoveryEmailStatus,
  confirmRecoveryEmail,
  getMyRecoveryEmailStatus,
  requestRecoveryEmailVerification,
} from "../lib/accountRecoveryApi";
import { updateCompanySettingsRemote } from "../lib/companySettingsApi";
import {
  type MachineMigrationItemResult,
  type MachineMigrationReport,
  migrateMachinesToSupabase,
} from "../lib/machinesMigration";
import {
  type ProductionMigrationItemResult,
  type ProductionMigrationReport,
  migrateProjectProductionsToSupabase,
} from "../lib/productionStagesMigration";
import {
  type QmsInspectionMigrationReport,
  type QmsMigrationItemResult,
  migrateQmsInspectionsToSupabase,
} from "../lib/qmsInspectionsMigration";
import {
  type OrgUserRow,
  type SecurityAuditLogEntry,
  createOrgUser,
  getRoleDefaultPermissions,
  listOrgUsers,
  listSecurityAuditLog,
  listUserOverrides,
  resetUserPassword,
  saveUserOverrides,
  setUserActive,
  setUserRole,
} from "../lib/settingsUsersApi";
import { canView, hasPermission } from "../permissions";
import { getModulesByCategory } from "../permissions";
import { useStore } from "../store";
import type { AppSettings } from "../types";

// Settings simplification (see chat) — a plain, reusable collapsed-by-
// default section wrapper for administrative/advanced groups (Team &
// Access, Advanced, and the nested Legacy Data Migration group inside
// it). Same Collapsible + ghost-button + rotating-chevron pattern
// Employees.tsx's own "More details" disclosure already uses — not a new
// UI primitive, just this page's own use of the existing one. Every
// card rendered inside a section is the exact same component/JSX that
// used to render directly on the page; nothing about what a section
// contains, or how it behaves, changes — only whether it's visible by
// default.
function SettingsSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between px-3 h-auto py-2.5"
          data-ocid={`settings.section.${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.trigger`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="w-4 h-4 text-primary" />
            {title}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      {description && (
        <p className="text-xs text-muted-foreground px-3 mt-1">{description}</p>
      )}
      <CollapsibleContent className="space-y-4 pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Settings simplification (see chat) — the old "Email Reminders (Gmail
// SMTP)" card, verbatim (same fields, same save handler, same
// Configured/Not Configured badge), extracted only so it can be tucked
// behind its own collapsed-by-default disclosure inside Email &
// Notifications instead of sitting next to the real Email Accounts
// integration as if both were active systems. Confirmed unused by any
// Edge Function (no gmailSenderEmail/gmailAppPassword reader exists
// anywhere in supabase/functions) — not deleted, only de-emphasized.
function LegacyGmailSmtpDisclosure({
  emailConfigured,
  emailForm,
  setEmailForm,
  handleSaveEmail,
}: {
  emailConfigured: boolean;
  emailForm: { gmailSenderEmail: string; gmailAppPassword: string };
  setEmailForm: React.Dispatch<
    React.SetStateAction<{ gmailSenderEmail: string; gmailAppPassword: string }>
  >;
  handleSaveEmail: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between px-3 h-auto py-2"
          data-ocid="settings.email.legacy_trigger"
        >
          <span className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-muted-foreground" />
            Legacy Gmail SMTP settings
            <Badge variant="secondary" className="text-xs">
              Inactive
            </Badge>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Card data-ocid="settings.email.card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                Email Reminders (Gmail SMTP)
              </CardTitle>
              {emailConfigured ? (
                <Badge className="bg-success/10 text-success border-success/30 text-xs gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Configured
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs gap-1">
                  <XCircle className="w-3 h-3" /> Not Configured
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Sender Email (Gmail)</Label>
              <Input
                data-ocid="settings.gmail_email.input"
                type="email"
                className="mt-1 h-8 text-sm"
                placeholder="yourname@gmail.com"
                value={emailForm.gmailSenderEmail}
                onChange={(e) =>
                  setEmailForm((p) => ({
                    ...p,
                    gmailSenderEmail: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Gmail App Password</Label>
              <Input
                data-ocid="settings.gmail_password.input"
                type="password"
                className="mt-1 h-8 text-sm font-mono"
                placeholder="xxxx xxxx xxxx xxxx"
                value={emailForm.gmailAppPassword}
                onChange={(e) =>
                  setEmailForm((p) => ({
                    ...p,
                    gmailAppPassword: e.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-start gap-2 rounded-md bg-warning/15 border border-warning/30 p-3">
              <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-warning">
                Use a{" "}
                <a
                  href="https://support.google.com/accounts/answer/185833"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-medium"
                >
                  Gmail App Password
                </a>{" "}
                &mdash; not your regular Gmail password. You must enable 2-Step
                Verification on your Google account first. Email delivery
                requires a server-side SMTP relay for production.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveEmail}
                data-ocid="settings.email.save_button"
              >
                Save Email Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Settings() {
  const { currentUser } = useAuth();
  const { settings, updateSettings } = useStore();
  const settingsHydrationStatus = useStore((s) => s.settingsHydration.status);
  const { themeId, setThemeId, mode, setMode, resolvedMode, themes } =
    useTheme();

  const [showCompanyPreview, setShowCompanyPreview] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);

  const [companyForm, setCompanyForm] = useState({
    companyName: settings.companyName || "",
    companyAddress: settings.companyAddress || "",
    companyGstin: settings.companyGstin || "",
    companyStateName: settings.companyStateName || "",
    companyStateCode: settings.companyStateCode || "",
    companyPhone: settings.companyPhone || "",
    companyEmail: settings.companyEmail || "",
    companyWebsite: settings.companyWebsite || "",
    companyLogo: settings.companyLogo || "",
    bankName: settings.bankName || "",
    accountName: settings.accountName || "",
    accountNumber: settings.accountNumber || "",
    ifscCode: settings.ifscCode || "",
    bankBranch: settings.bankBranch || "",
    companyTerms: settings.companyTerms || "",
    companyDeclaration: settings.companyDeclaration || "",
    quotationTerms: settings.quotationTerms || "",
    companyPOTerms: settings.companyPOTerms || "",
  });

  // Company Settings fix — companyForm above only snapshots `settings`
  // on this component's first render, but the real Company Profile data
  // now arrives asynchronously from Supabase (useSupabaseHydration.ts's
  // company-settings effect), typically finishing after that first
  // render. Re-sync once hydration actually succeeds so the form shows
  // the org's real saved values rather than blank defaults. Keyed on
  // settingsHydrationStatus (not `settings` itself) so this fires
  // exactly once per successful hydration — not on every unrelated
  // settings save elsewhere on this page, which would otherwise wipe
  // out unsaved Company Profile edits mid-typing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-syncs only on the hydration-status transition, not on every `settings` change (see comment above)
  useEffect(() => {
    if (settingsHydrationStatus !== "success") return;
    setCompanyForm({
      companyName: settings.companyName || "",
      companyAddress: settings.companyAddress || "",
      companyGstin: settings.companyGstin || "",
      companyStateName: settings.companyStateName || "",
      companyStateCode: settings.companyStateCode || "",
      companyPhone: settings.companyPhone || "",
      companyEmail: settings.companyEmail || "",
      companyWebsite: settings.companyWebsite || "",
      companyLogo: settings.companyLogo || "",
      bankName: settings.bankName || "",
      accountName: settings.accountName || "",
      accountNumber: settings.accountNumber || "",
      ifscCode: settings.ifscCode || "",
      bankBranch: settings.bankBranch || "",
      companyTerms: settings.companyTerms || "",
      companyDeclaration: settings.companyDeclaration || "",
      quotationTerms: settings.quotationTerms || "",
      companyPOTerms: settings.companyPOTerms || "",
    });
  }, [settingsHydrationStatus]);

  const [whatsappForm, setWhatsappForm] = useState({
    twilioAccountSid: settings.twilioAccountSid,
    twilioAuthToken: settings.twilioAuthToken,
    twilioFromNumber: settings.twilioFromNumber,
  });

  // AI Agent redesign (see chat) — the assistant's configurable display
  // name plus voice settings. Same local-form + Save pattern as Company
  // Profile above; AgentPage.tsx reads these fields directly from the
  // store (no new context/mechanism), falling back to sane defaults
  // (name "FabFlow Copilot", voice off, browser default language) when
  // unset.
  const [aiAssistantForm, setAiAssistantForm] = useState({
    aiAssistantName: settings.aiAssistantName || "",
    voiceEnabled: settings.voiceEnabled ?? false,
    voiceInputLanguage: settings.voiceInputLanguage || DEFAULT_VOICE_LANGUAGE,
    voiceOutputLanguage: settings.voiceOutputLanguage || DEFAULT_VOICE_LANGUAGE,
    autoSpeakResponses: settings.autoSpeakResponses ?? false,
  });
  // AI Agent redesign (see chat) — computed once per render from the
  // actual browser capability, not a stored setting: a control for a
  // capability this browser genuinely lacks is disabled with an
  // explanatory note rather than silently offered.
  const sttSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();
  const speechSupported = sttSupported || ttsSupported;

  const [emailForm, setEmailForm] = useState({
    gmailSenderEmail: settings.gmailSenderEmail,
    gmailAppPassword: settings.gmailAppPassword,
  });

  if (!canView(currentUser, "settings")) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
        data-ocid="settings.page"
      >
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <Lock className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to view this module.
          </p>
        </div>
      </div>
    );
  }

  const companyConfigured = companyForm.companyName.trim() !== "";
  // Company Settings fix — the same permission RLS itself enforces
  // (company_settings_insert/_update both require has_permission
  // ('settings','edit')); this is a UI convenience so an unauthorized
  // user sees a disabled button instead of a failed save, not a
  // replacement for the server-side check.
  const pCompanyEdit = hasPermission(currentUser, "settings.edit");

  const whatsappConfigured =
    whatsappForm.twilioAccountSid.trim() !== "" &&
    whatsappForm.twilioAuthToken.trim() !== "" &&
    whatsappForm.twilioFromNumber.trim() !== "";

  const emailConfigured =
    emailForm.gmailSenderEmail.trim() !== "" &&
    emailForm.gmailAppPassword.trim() !== "";

  // Company Settings fix — Supabase is now the authoritative write.
  // updateSettings() (Zustand/localStorage) only ever runs AFTER
  // updateCompanySettingsRemote() succeeds, so a failed save can no
  // longer look like it worked: the user's in-progress companyForm
  // input is left exactly as they typed it (nothing is reset) and an
  // error toast explains what happened, matching the existing app-wide
  // error-toast convention every other Save button here already uses.
  const handleSaveCompany = async () => {
    if (!pCompanyEdit) {
      toast.error("You do not have permission to edit company settings.");
      return;
    }
    setSavingCompany(true);
    try {
      const result = await updateCompanySettingsRemote(companyForm);
      if (result.status !== "success") {
        toast.error(
          result.status === "denied"
            ? (result.error ??
                "You do not have permission to edit company settings.")
            : result.status === "unauthenticated"
              ? "Sign in required to save company settings."
              : (result.error ??
                "Could not save company settings — please try again."),
        );
        return;
      }
      updateSettings({ ...settings, ...companyForm });
      toast.success("Company profile saved");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleSaveAiAssistant = () => {
    updateSettings({
      ...settings,
      aiAssistantName: aiAssistantForm.aiAssistantName.trim() || undefined,
      voiceEnabled: aiAssistantForm.voiceEnabled,
      voiceInputLanguage: aiAssistantForm.voiceInputLanguage,
      voiceOutputLanguage: aiAssistantForm.voiceOutputLanguage,
      autoSpeakResponses: aiAssistantForm.autoSpeakResponses,
    });
    toast.success("AI Assistant settings saved");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setCompanyForm((p) => ({ ...p, companyLogo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSaveWhatsApp = () => {
    const updated: AppSettings = {
      ...settings,
      twilioAccountSid: whatsappForm.twilioAccountSid.trim(),
      twilioAuthToken: whatsappForm.twilioAuthToken.trim(),
      twilioFromNumber: whatsappForm.twilioFromNumber.trim(),
    };
    updateSettings(updated);
    toast.success("WhatsApp (Twilio) settings saved");
  };

  const handleSaveEmail = () => {
    const updated: AppSettings = {
      ...settings,
      gmailSenderEmail: emailForm.gmailSenderEmail.trim(),
      gmailAppPassword: emailForm.gmailAppPassword.trim(),
    };
    updateSettings(updated);
    toast.success("Email (Gmail SMTP) settings saved");
  };

  return (
    <div className="space-y-6 max-w-2xl" data-ocid="settings.page">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure company profile and integration credentials.
        </p>
      </div>

      {/* Company Profile */}
      <Card data-ocid="settings.company.card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Company Profile
            </CardTitle>
            {companyConfigured ? (
              <Badge className="bg-success/10 text-success border-success/30 text-xs gap-1">
                <CheckCircle2 className="w-3 h-3" /> Configured
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs gap-1">
                <XCircle className="w-3 h-3" /> Not Configured
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Company Name</Label>
            <Input
              data-ocid="settings.company_name.input"
              className="mt-1 h-8 text-sm"
              placeholder="Your Company Pvt. Ltd."
              value={companyForm.companyName}
              onChange={(e) =>
                setCompanyForm((p) => ({ ...p, companyName: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Company Address</Label>
            <Input
              data-ocid="settings.company_address.input"
              className="mt-1 h-8 text-sm"
              placeholder="Full registered address"
              value={companyForm.companyAddress}
              onChange={(e) =>
                setCompanyForm((p) => ({
                  ...p,
                  companyAddress: e.target.value,
                }))
              }
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">GSTIN</Label>
              <Input
                data-ocid="settings.company_gstin.input"
                className="mt-1 h-8 text-sm font-mono"
                placeholder="27AABCD1234E1ZX"
                value={companyForm.companyGstin}
                onChange={(e) =>
                  setCompanyForm((p) => ({
                    ...p,
                    companyGstin: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">State Name</Label>
              <Input
                data-ocid="settings.company_state_name.input"
                className="mt-1 h-8 text-sm"
                placeholder="Maharashtra"
                value={companyForm.companyStateName}
                onChange={(e) =>
                  setCompanyForm((p) => ({
                    ...p,
                    companyStateName: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="max-w-xs">
            <Label className="text-xs">State Code</Label>
            <Input
              data-ocid="settings.company_state_code.input"
              className="mt-1 h-8 text-sm"
              placeholder="27"
              value={companyForm.companyStateCode}
              onChange={(e) =>
                setCompanyForm((p) => ({
                  ...p,
                  companyStateCode: e.target.value,
                }))
              }
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone Number</Label>
              <Input
                data-ocid="settings.company_phone.input"
                className="mt-1 h-8 text-sm"
                placeholder="+91 98765 43210"
                value={companyForm.companyPhone}
                onChange={(e) =>
                  setCompanyForm((p) => ({
                    ...p,
                    companyPhone: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                data-ocid="settings.company_email.input"
                type="email"
                className="mt-1 h-8 text-sm"
                placeholder="company@example.com"
                value={companyForm.companyEmail}
                onChange={(e) =>
                  setCompanyForm((p) => ({
                    ...p,
                    companyEmail: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Website</Label>
            <Input
              data-ocid="settings.company_website.input"
              className="mt-1 h-8 text-sm"
              placeholder="www.example.com"
              value={companyForm.companyWebsite}
              onChange={(e) =>
                setCompanyForm((p) => ({
                  ...p,
                  companyWebsite: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Company Logo (PNG/JPG)</Label>
            <Input
              data-ocid="settings.company_logo.upload_button"
              type="file"
              accept="image/png,image/jpeg"
              className="mt-1 h-8 text-sm"
              onChange={handleLogoUpload}
            />
            {companyForm.companyLogo && (
              <div className="mt-2">
                <img
                  src={companyForm.companyLogo}
                  alt="Company logo preview"
                  className="max-h-16 object-contain border rounded p-1"
                />
              </div>
            )}
          </div>
          {/* Bank Details */}
          <div className="pt-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Bank Details
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div>
                <Label className="text-xs">Bank Name</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="State Bank of India"
                  value={companyForm.bankName}
                  onChange={(e) =>
                    setCompanyForm((p) => ({ ...p, bankName: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Account Name</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Your Company Name"
                  value={companyForm.accountName}
                  onChange={(e) =>
                    setCompanyForm((p) => ({
                      ...p,
                      accountName: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Account Number</Label>
                <Input
                  className="mt-1 h-8 text-sm font-mono"
                  placeholder="1234567890"
                  value={companyForm.accountNumber}
                  onChange={(e) =>
                    setCompanyForm((p) => ({
                      ...p,
                      accountNumber: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">IFSC Code</Label>
                <Input
                  className="mt-1 h-8 text-sm font-mono"
                  placeholder="SBIN0001234"
                  value={companyForm.ifscCode}
                  onChange={(e) =>
                    setCompanyForm((p) => ({ ...p, ifscCode: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Branch</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="Main Branch"
                  value={companyForm.bankBranch}
                  onChange={(e) =>
                    setCompanyForm((p) => ({
                      ...p,
                      bankBranch: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          {/* Terms & Declaration */}
          <div>
            <Label className="text-xs">
              Terms &amp; Conditions (appears on documents)
            </Label>
            <Textarea
              className="mt-1 text-sm"
              rows={3}
              placeholder="1. Payment due within 30 days..."
              value={companyForm.companyTerms}
              onChange={(e) =>
                setCompanyForm((p) => ({ ...p, companyTerms: e.target.value }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Declaration (appears on invoices)</Label>
            <Textarea
              className="mt-1 text-sm"
              rows={2}
              placeholder="We declare that this invoice shows the actual price..."
              value={companyForm.companyDeclaration}
              onChange={(e) =>
                setCompanyForm((p) => ({
                  ...p,
                  companyDeclaration: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">
              Default Quotation Terms (auto-fills new quotations)
            </Label>
            <Textarea
              className="mt-1 text-sm"
              rows={3}
              placeholder="1. Payment due within 30 days..."
              value={companyForm.quotationTerms}
              onChange={(e) =>
                setCompanyForm((p) => ({
                  ...p,
                  quotationTerms: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <Label className="text-xs">
              Default Company PO Terms (auto-fills new purchase orders)
            </Label>
            <Textarea
              className="mt-1 text-sm"
              rows={3}
              placeholder="1. Delivery within agreed timeline..."
              value={companyForm.companyPOTerms}
              onChange={(e) =>
                setCompanyForm((p) => ({
                  ...p,
                  companyPOTerms: e.target.value,
                }))
              }
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCompanyPreview(true)}
              data-ocid="settings.company.preview_button"
            >
              <Eye className="w-4 h-4 mr-1" /> Preview
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCompany}
              disabled={!pCompanyEdit || savingCompany}
              title={
                pCompanyEdit
                  ? undefined
                  : "You do not have permission to edit company settings"
              }
              data-ocid="settings.company.save_button"
            >
              {savingCompany ? "Saving..." : "Save Company Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card data-ocid="settings.appearance.card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              Appearance
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-muted-foreground">
                Choose a color palette for the entire ERP. Applies everywhere
                immediately.
              </p>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={mode}
              onValueChange={(value) => {
                if (value) setMode(value as "light" | "dark" | "system");
              }}
              data-ocid="settings.appearance.mode_toggle"
            >
              <ToggleGroupItem value="light" aria-label="Light mode">
                <Sun className="w-3.5 h-3.5 mr-1" /> Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" aria-label="Dark mode">
                <Moon className="w-3.5 h-3.5 mr-1" /> Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="system" aria-label="Match system">
                <Monitor className="w-3.5 h-3.5 mr-1" /> System
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Settings simplification (see chat) — this used to be two
              visually separate grids ("Theme" plain accents, then a
              border-divided "UI Style" section below it) that both wrote
              the exact same themeId/setThemeId selection underneath (one
              active preset at a time, like Instrument already does).
              Presenting one setting as two sections was confusing, not
              two independent choices — merged into a single grid with
              one description. No preset was added or removed, and
              selection behavior (mutually exclusive, same onSelect) is
              unchanged. */}
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              Pick an accent color or a named style direction — either one sets
              the whole look at once.
            </p>
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
              data-ocid="settings.appearance.theme_grid"
            >
              {themes.map((preset) => (
                <ThemePreviewCard
                  key={preset.id}
                  preset={preset}
                  mode={resolvedMode}
                  isSelected={preset.id === themeId}
                  onSelect={() => setThemeId(preset.id)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings simplification (see chat) — Email Accounts (the real,
          active multi-mailbox integration) is listed first so it reads as
          the primary email configuration; WhatsApp reminders and the
          legacy Gmail SMTP card (demoted into its own collapsed
          disclosure below) are secondary. No card's own logic changed. */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
          Email &amp; Notifications
        </h2>
        <div className="space-y-4">
          <EmailAccountsCard />

          <Card data-ocid="settings.whatsapp.card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  WhatsApp Reminders (via Twilio)
                </CardTitle>
                {whatsappConfigured ? (
                  <Badge className="bg-success/10 text-success border-success/30 text-xs gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Configured
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <XCircle className="w-3 h-3" /> Not Configured
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Twilio Account SID</Label>
                <Input
                  data-ocid="settings.twilio_sid.input"
                  className="mt-1 h-8 text-sm font-mono"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={whatsappForm.twilioAccountSid}
                  onChange={(e) =>
                    setWhatsappForm((p) => ({
                      ...p,
                      twilioAccountSid: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Auth Token</Label>
                <Input
                  data-ocid="settings.twilio_token.input"
                  type="password"
                  className="mt-1 h-8 text-sm font-mono"
                  placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                  value={whatsappForm.twilioAuthToken}
                  onChange={(e) =>
                    setWhatsappForm((p) => ({
                      ...p,
                      twilioAuthToken: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">From Number (WhatsApp)</Label>
                <Input
                  data-ocid="settings.twilio_from.input"
                  className="mt-1 h-8 text-sm font-mono"
                  placeholder="whatsapp:+14155238886"
                  value={whatsappForm.twilioFromNumber}
                  onChange={(e) =>
                    setWhatsappForm((p) => ({
                      ...p,
                      twilioFromNumber: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-start gap-2 rounded-md bg-info/10 border border-info/30 p-3">
                <Info className="w-3.5 h-3.5 text-info mt-0.5 shrink-0" />
                <p className="text-xs text-info">
                  Credentials are stored locally in the browser. For production,
                  ensure your environment has proper CORS handling for Twilio
                  API calls. Get your credentials from{" "}
                  <a
                    href="https://console.twilio.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium"
                  >
                    console.twilio.com
                  </a>
                  .
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleSaveWhatsApp}
                  data-ocid="settings.whatsapp.save_button"
                >
                  Save WhatsApp Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Gmail SMTP — confirmed genuinely unused (no Edge Function
              reads gmailSenderEmail/gmailAppPassword anywhere; the real
              outbound path is EmailAccountsCard above). Not removed, just
              demoted into its own collapsed-by-default "Legacy" section
              so it never reads as a second active email system next to
              Email Accounts. Same card, same fields, same save handler —
              only the disclosure wrapper is new. */}
          <LegacyGmailSmtpDisclosure
            emailConfigured={emailConfigured}
            emailForm={emailForm}
            setEmailForm={setEmailForm}
            handleSaveEmail={handleSaveEmail}
          />
        </div>
      </div>

      {/* Settings simplification (see chat) — Team & Access groups every
          user/role/permission control in one collapsed-by-default
          section instead of them sitting in the main flow of the page.
          Same UserManagement/AccountRecoveryCard components, same
          internal Edit/Reset-Password/Activate-Deactivate/permission-
          matrix behavior — only visibility-by-default changed. */}
      <SettingsSection
        title="Team & Access"
        description="Users, roles, permissions, and admin account recovery."
        icon={Users}
      >
        <UserManagement />
        <AccountRecoveryCard />
      </SettingsSection>

      {/* Data */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
          Data
        </h2>
        <BackupRestore />
      </div>

      {/* Settings simplification (see chat) — Advanced groups the AI
          Assistant voice config, the Security Audit Log, and the
          one-time Legacy Data Migration tools behind one collapsed-by-
          default section, so a normal user opening Settings doesn't land
          on four migration cards or an audit log table first. Every
          child component/card here is unchanged. */}
      <SettingsSection
        title="Advanced"
        description="AI Assistant voice settings, the security audit log, and one-time legacy data migration tools."
        icon={SlidersHorizontal}
      >
        <Card data-ocid="settings.ai_assistant.card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              AI Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Assistant Name</Label>
              <Input
                className="h-8 text-sm max-w-sm"
                placeholder="FabFlow Copilot"
                value={aiAssistantForm.aiAssistantName}
                onChange={(e) =>
                  setAiAssistantForm((f) => ({
                    ...f,
                    aiAssistantName: e.target.value,
                  }))
                }
                data-ocid="settings.ai_assistant.name.input"
              />
              <p className="text-xs text-muted-foreground">
                Shown in the AI Agent conversation header. Leave blank to use
                the default, "FabFlow Copilot".
              </p>
            </div>

            <div className="pt-1 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-xs font-medium">
                    Voice Conversation
                  </Label>
                </div>
                <Switch
                  checked={aiAssistantForm.voiceEnabled}
                  onCheckedChange={(checked) =>
                    setAiAssistantForm((f) => ({
                      ...f,
                      voiceEnabled: checked,
                    }))
                  }
                  disabled={!speechSupported}
                  data-ocid="settings.ai_assistant.voice_enabled.switch"
                />
              </div>
              {!speechSupported && (
                <p className="text-xs text-warning">
                  This browser doesn't support speech input or playback (Web
                  Speech API) — voice conversation stays unavailable here, but
                  text chat is unaffected.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Voice Input Language</Label>
                  <Select
                    value={aiAssistantForm.voiceInputLanguage}
                    onValueChange={(value) =>
                      setAiAssistantForm((f) => ({
                        ...f,
                        voiceInputLanguage: value,
                      }))
                    }
                    disabled={!sttSupported}
                  >
                    <SelectTrigger
                      className="h-8 text-sm"
                      data-ocid="settings.ai_assistant.voice_input_lang.select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_VOICE_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!sttSupported && (
                    <p className="text-xs text-muted-foreground">
                      Speech recognition isn't supported in this browser.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Voice Output Language</Label>
                  <Select
                    value={aiAssistantForm.voiceOutputLanguage}
                    onValueChange={(value) =>
                      setAiAssistantForm((f) => ({
                        ...f,
                        voiceOutputLanguage: value,
                      }))
                    }
                    disabled={!ttsSupported}
                  >
                    <SelectTrigger
                      className="h-8 text-sm"
                      data-ocid="settings.ai_assistant.voice_output_lang.select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_VOICE_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!ttsSupported && (
                    <p className="text-xs text-muted-foreground">
                      Speech playback isn't supported in this browser.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-xs font-medium">
                    Auto-Speak Responses
                  </Label>
                </div>
                <Switch
                  checked={aiAssistantForm.autoSpeakResponses}
                  onCheckedChange={(checked) =>
                    setAiAssistantForm((f) => ({
                      ...f,
                      autoSpeakResponses: checked,
                    }))
                  }
                  disabled={!ttsSupported}
                  data-ocid="settings.ai_assistant.auto_speak.switch"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                When on, every assistant reply is read aloud automatically. Off
                by default — you can always play a reply's audio manually from
                its speaker button in the conversation.
              </p>
            </div>

            <Button
              size="sm"
              onClick={handleSaveAiAssistant}
              data-ocid="settings.ai_assistant.save_button"
            >
              Save
            </Button>
          </CardContent>
        </Card>

        <SecurityAuditLog />

        {/* Legacy Data Migration — one-time, self-service tools (Phases
            14/35/45/46) for importing older browser-local data saved
            before Supabase became authoritative. Nested one level deeper
            and collapsed by default: normal FabFlow modules already save
            directly to Supabase through their own workflows, so these are
            not something a user needs to run to "keep Supabase updated". */}
        <SettingsSection
          title="Legacy Data Migration"
          description={
            "These tools are for importing older browser-local data from previous migration periods. Normal FabFlow records are saved directly to Supabase."
          }
          icon={Archive}
        >
          <DrawingRepositoryMigration />
          <MachinesMigration />
          <ProductionStagesMigration />
          <QmsInspectionsMigration />
        </SettingsSection>
      </SettingsSection>

      {/* Company Profile Preview Modal */}
      <CompanyProfilePrintView
        open={showCompanyPreview}
        onClose={() => setShowCompanyPreview(false)}
      />
    </div>
  );
}

// ── Email Accounts Component (Universal Email Integration, see chat) ───────────
// Own function, own local state, wrapping its own <Card> — same shape as
// BackupRestore/UserManagement below, since this card's data (a list
// fetched from Supabase, not a single form bound to `settings`) doesn't
// fit the simple xForm/xConfigured pattern the other Card sections above
// use.

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Workspace / Gmail",
  microsoft: "Microsoft 365",
  imap_smtp: "IMAP / SMTP",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  connected: { label: "Connected", className: "text-success" },
  auth_required: {
    label: "Authentication required",
    className: "text-warning",
  },
  sync_failed: { label: "Sync failed", className: "text-destructive" },
  disconnected: { label: "Disconnected", className: "text-muted-foreground" },
};

function EmailAccountsCard() {
  const [accounts, setAccounts] = useState<
    Awaited<ReturnType<typeof listEmailAccounts>>["data"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [connectOpen, setConnectOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const result: EmailWriteResult<typeof accounts> = await listEmailAccounts();
    setLoading(false);
    if (result.status === "success") {
      setAccounts(result.data ?? []);
    } else if (result.status !== "unauthenticated") {
      toast.error(result.error || "Could not load connected email accounts.");
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-only — refresh is redefined every render but this effect should only ever run once, on mount.
  useEffect(() => {
    void refresh();
  }, []);

  // Phase 9E — email-oauth-callback redirects back here (via
  // FABFLOW_APP_URL) with ?oauthConnected=1 or ?oauthError=... after the
  // Google consent screen. Surface the result once, refresh the list, and
  // strip the query params so a page reload doesn't re-show the toast.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-only — reads window.location.search once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthConnected = params.get("oauthConnected");
    const oauthError = params.get("oauthError");
    if (!oauthConnected && !oauthError) return;
    if (oauthConnected) {
      toast.success("Mailbox connected via Google.");
      void refresh();
    } else if (oauthError) {
      toast.error(oauthError);
    }
    params.delete("oauthConnected");
    params.delete("oauthError");
    const newSearch = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (newSearch ? `?${newSearch}` : ""),
    );
  }, []);

  const handleSync = async (id: string) => {
    setSyncingId(id);
    const result = await syncEmailAccount(id);
    setSyncingId(null);
    if (result.status !== "success") {
      toast.error(result.error || "Sync failed.");
      return;
    }
    toast.success(
      result.data && result.data.newMessages > 0
        ? `Synced — ${result.data.newMessages} message(s) processed.`
        : "Synced — no new messages.",
    );
    void refresh();
  };

  const handleMakeDefault = async (id: string, emailAddress: string) => {
    setSettingDefaultId(id);
    // A plain single-row update - the database trigger (once applied)
    // clears any other default in this organization atomically; the
    // client never does a two-step "unset old, set new" itself.
    const result = await updateEmailAccountSettings(id, {
      isDefaultSender: true,
    });
    setSettingDefaultId(null);
    if (result.status !== "success") {
      toast.error(result.error || "Could not set this as the default sender.");
      return;
    }
    toast.success(
      `${emailAddress} is now the default sender for OTP/recovery emails`,
    );
    void refresh();
  };

  const handleDisconnect = async (id: string, emailAddress: string) => {
    const result = await disconnectEmailAccount(id);
    if (result.status !== "success") {
      toast.error(result.error || "Could not disconnect this account.");
      return;
    }
    toast.success(`Disconnected ${emailAddress}`);
    void refresh();
  };

  return (
    <Card data-ocid="settings.email_accounts.card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            Email Accounts
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setConnectOpen(true)}
            data-ocid="settings.email_accounts.add_button"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Email Account
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !accounts || accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No email accounts connected yet. Connect a mailbox to see it in the
            Email Center — Gmail, Microsoft 365, or any IMAP/SMTP provider
            (Hostinger, cPanel, Zoho, and others).
          </p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {accounts.map((acct) => {
              const statusInfo = STATUS_LABELS[acct.status] ?? {
                label: acct.status,
                className: "text-muted-foreground",
              };
              return (
                <div
                  key={acct.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                  data-ocid="settings.email_accounts.row"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {acct.emailAddress}
                      </p>
                      {acct.isDefaultSender && (
                        <Badge
                          variant="outline"
                          className="text-success border-success/30 bg-success/10 gap-1 shrink-0"
                          data-ocid="settings.email_accounts.default_badge"
                        >
                          <Star className="w-3 h-3 fill-current" />
                          Default Sender
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {PROVIDER_LABELS[acct.provider] ?? acct.provider}
                      </span>
                      <span>·</span>
                      <span className={statusInfo.className}>
                        ● {statusInfo.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!acct.isDefaultSender && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Make default sender"
                        onClick={() =>
                          void handleMakeDefault(acct.id, acct.emailAddress)
                        }
                        disabled={settingDefaultId === acct.id}
                        data-ocid="settings.email_accounts.make_default_button"
                      >
                        {settingDefaultId === acct.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Star className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Sync now"
                      onClick={() => void handleSync(acct.id)}
                      disabled={syncingId === acct.id}
                      data-ocid="settings.email_accounts.sync_button"
                    >
                      {syncingId === acct.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Disconnect"
                      onClick={() =>
                        void handleDisconnect(acct.id, acct.emailAddress)
                      }
                      data-ocid="settings.email_accounts.disconnect_button"
                    >
                      <Unplug className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <ConnectEmailAccountDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={() => void refresh()}
      />
    </Card>
  );
}

// ── Backup & Restore Component ────────────────────────────────────────────────

function BackupRestore() {
  const store = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingData, setPendingData] = useState<Record<
    string,
    unknown[]
  > | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleExport = () => {
    const backup = {
      version: "v1",
      exportedAt: new Date().toISOString(),
      customers: store.customers || [],
      projects: store.projects || [],
      quotations: store.quotations || [],
      purchaseOrders: store.purchaseOrders || [],
      masterPOs: store.masterPOs || [],
      companyPOs: store.companyPOs || [],
      inventoryItems: store.inventoryItems || [],
      materialRequisitions: store.materialRequisitions || [],
      projectProductions: store.projectProductions || [],
      deliveryChallans: store.deliveryChallans || [],
      invoices: store.invoices || [],
      payments: store.payments || [],
      pettyExpenses: store.pettyExpenses || [],
      employees: store.employees || [],
      vendors: store.vendors || [],
      payables: store.payables || [],
      payablePayments: store.payablePayments || [],
      materialUsages: store.materialUsages || [],
      materialPurchases: store.materialPurchases || [],
      outsourcedWorks: store.outsourcedWorks || [],
      advanceRecords: store.advanceRecords || [],
      salaryPayments: store.salaryPayments || [],
      expenseFloats: store.expenseFloats || [],
      inventoryPurchases: store.inventoryPurchases || [],
      bomItems: store.bomItems || [],
      bomRequisitions: store.bomRequisitions || [],
      designFiles: store.designFiles || [],
      internalCostings: store.internalCostings || [],
      attendanceRecords: store.attendanceRecords || [],
      projectDeliveries: store.projectDeliveries || [],
      projectItems: store.projectItems || [],
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `fabflow-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exported successfully");
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (
          data.version !== "v1" ||
          !["customers", "projects", "invoices", "employees"].some(
            (k) => k in data,
          )
        ) {
          toast.error("Invalid backup file. Version or structure mismatch.");
          return;
        }
        setPendingData(data);
        setShowConfirm(true);
      } catch {
        toast.error("Failed to parse backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRestore = () => {
    if (!pendingData) return;
    store.restoreFromBackup(pendingData);
    toast.success("Data restored successfully");
    setShowConfirm(false);
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <>
      <Card data-ocid="settings.backup.card">
        <CardHeader>
          <CardTitle className="text-base">Backup & Restore</CardTitle>
          <p className="text-sm text-muted-foreground">
            Export all system data as a JSON file or restore from a previous
            backup.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleExport}
            data-ocid="settings.backup.primary_button"
          >
            Export Backup
          </Button>

          {/* Settings simplification (see chat) — Restore is the one
              irreversible, destructive action on this page (it overwrites
              every current record), so it gets its own visually distinct
              "danger zone" box instead of sitting next to Export as an
              equally-weighted button. Same handler, same confirm dialog,
              same behavior — only the styling changed. */}
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Danger zone
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Restoring will replace all current data permanently. This cannot
              be undone.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              data-ocid="settings.restore.secondary_button"
            >
              Restore Data
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelected}
          />
        </CardContent>
      </Card>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent data-ocid="settings.restore.dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all current data and cannot be undone. Are you
              sure you want to restore?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowConfirm(false)}
              data-ocid="settings.restore.cancel_button"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRestore}
              data-ocid="settings.restore.confirm_button"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Drawing Repository Migration Component ──────────────────────────────────
//
// One-time, user-triggered IndexedDB (fabflow-drawing-editor) -> Supabase
// import for the Engineering Drawing Editor module (Phase 14). Safe to run
// more than once — already-migrated items are skipped, nothing is
// duplicated, and the local IndexedDB database is never modified or
// cleared by this action (see drawingEditor/lib/migrateToSupabase.ts).
// Gated on drawing_editor.create — the same permission the module already
// requires to create a drawing, not a new permission.

function DrawingRepositoryMigration() {
  const { currentUser } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [report, setReport] = useState<MigrationReport | null>(null);

  if (!hasPermission(currentUser, "drawing_editor.create")) return null;

  const handleMigrate = async () => {
    setRunning(true);
    setProgress("Starting…");
    setReport(null);
    try {
      const result = await migrateDrawingRepositoryToSupabase((msg) =>
        setProgress(msg),
      );
      setReport(result);
      const failed =
        result.drawings.filter((r) => r.status === "failed").length +
        result.views.filter((r) => r.status === "failed").length +
        result.links.filter((r) => r.status === "failed").length +
        result.preferences.filter((r) => r.status === "failed").length;
      if (failed > 0) {
        toast.error(
          `Migration finished with ${failed} failed item(s) — see details below.`,
        );
      } else {
        toast.success("Drawing Repository migration finished successfully.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Migration failed to start.",
      );
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  const summarize = (items: MigrationItemResult[]) => ({
    migrated: items.filter((i) => i.status === "migrated").length,
    already: items.filter((i) => i.status === "already_migrated").length,
    failed: items.filter((i) => i.status === "failed").length,
  });

  return (
    <Card data-ocid="settings.drawing_migration.card">
      <CardHeader>
        <CardTitle className="text-base">
          Drawing Repository Migration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          One-time import of locally-stored Engineering Drawings (Repository,
          Design File Masters, Production Drawings, saved views, links, and your
          own editor preferences) into Supabase. Safe to run more than once —
          already-migrated items are skipped. Your local drawing data is never
          modified or deleted by this action.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleMigrate}
            disabled={running}
            data-ocid="settings.drawing_migration.run_button"
          >
            {running ? "Migrating…" : "Migrate Local Drawings to Supabase"}
          </Button>
          {running && progress && (
            <span className="text-xs text-muted-foreground truncate max-w-xs">
              {progress}
            </span>
          )}
        </div>

        {report && (
          <div className="mt-4 space-y-3 text-sm">
            {(
              [
                ["Drawings", report.drawings],
                ["Views", report.views],
                ["Links", report.links],
                ["Preferences", report.preferences],
              ] as [string, MigrationItemResult[]][]
            ).map(([label, items]) => {
              const s = summarize(items);
              return (
                <div key={label} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium w-24">{label}:</span>
                  <Badge variant="secondary">{s.migrated} migrated</Badge>
                  <Badge variant="outline">{s.already} already migrated</Badge>
                  {s.failed > 0 && (
                    <Badge variant="destructive">{s.failed} failed</Badge>
                  )}
                </div>
              );
            })}

            {[
              ...report.drawings,
              ...report.views,
              ...report.links,
              ...report.preferences,
            ]
              .filter((r) => r.status === "failed")
              .map((r) => (
                <p key={r.id} className="text-xs text-destructive">
                  {r.label}: {r.error}
                </p>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Machinery Migration Component ────────────────────────────────────────
//
// One-time, user-triggered local (Zustand/localStorage) -> Supabase import
// for the Machinery module (Phase 35). Safe to run more than once —
// already-migrated machines (matched by id) are skipped, nothing is
// duplicated, and local state is never modified or cleared by this action
// (see lib/machinesMigration.ts). Gated on machinery.create — the same
// permission the module already requires to add a machine, not a new
// permission.

function MachinesMigration() {
  const { currentUser } = useAuth();
  // Deliberately NOT `s.machines` - see the field's comment on the Store
  // interface (store.ts). By the time this component renders, `machines`
  // has almost always already been overwritten by a successful Supabase
  // hydration; this snapshot is the one place pre-migration local data
  // actually survives long enough to be migrated.
  const preMigrationMachines = useStore((s) => s.preMigrationMachinesSnapshot);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [report, setReport] = useState<MachineMigrationReport | null>(null);

  if (!hasPermission(currentUser, "machinery.create")) return null;

  const handleMigrate = async () => {
    setRunning(true);
    setProgress("Starting…");
    setReport(null);
    try {
      const result = await migrateMachinesToSupabase(
        preMigrationMachines || [],
        (msg) => setProgress(msg),
      );
      setReport(result);
      const failed = result.machines.filter(
        (r) => r.status === "failed",
      ).length;
      if (failed > 0) {
        toast.error(
          `Migration finished with ${failed} failed item(s) — see details below.`,
        );
      } else {
        toast.success("Machinery migration finished successfully.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Migration failed to start.",
      );
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  const summarize = (items: MachineMigrationItemResult[]) => ({
    migrated: items.filter((i) => i.status === "migrated").length,
    already: items.filter((i) => i.status === "already_migrated").length,
    failed: items.filter((i) => i.status === "failed").length,
  });

  return (
    <Card data-ocid="settings.machines_migration.card">
      <CardHeader>
        <CardTitle className="text-base">Machinery Migration</CardTitle>
        <p className="text-sm text-muted-foreground">
          One-time import of locally-stored Machines into Supabase. Safe to run
          more than once — already-migrated machines are skipped by id, never
          duplicated. Your local machine data is never modified or deleted by
          this action. Service records, service parts, and machine documents
          remain local-only and are unaffected.
        </p>
        <p className="text-xs text-muted-foreground">
          {preMigrationMachines?.length ?? 0} machine(s) found in this browser's
          local snapshot, taken before Machinery started syncing to Supabase.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleMigrate}
            disabled={running}
            data-ocid="settings.machines_migration.run_button"
          >
            {running ? "Migrating…" : "Migrate Local Machines to Supabase"}
          </Button>
          {running && progress && (
            <span className="text-xs text-muted-foreground truncate max-w-xs">
              {progress}
            </span>
          )}
        </div>

        {report && (
          <div className="mt-4 space-y-3 text-sm">
            {(() => {
              const s = summarize(report.machines);
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium w-24">Machines:</span>
                  <Badge variant="secondary">{s.migrated} migrated</Badge>
                  <Badge variant="outline">{s.already} already migrated</Badge>
                  {s.failed > 0 && (
                    <Badge variant="destructive">{s.failed} failed</Badge>
                  )}
                </div>
              );
            })()}

            {report.machines
              .filter((r) => r.status === "failed")
              .map((r) => (
                <p key={r.id} className="text-xs text-destructive">
                  {r.label}: {r.error}
                </p>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductionStagesMigration() {
  const { currentUser } = useAuth();
  // Deliberately NOT `s.projectProductions` - see the field's comment on
  // the Store interface (store.ts), same rationale as
  // preMigrationMachinesSnapshot above: by the time this component
  // renders, projectProductions has almost always already been
  // overwritten by a successful Supabase hydration.
  const preMigrationProductions = useStore(
    (s) => s.preMigrationProjectProductionsSnapshot,
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [report, setReport] = useState<ProductionMigrationReport | null>(null);

  if (!hasPermission(currentUser, "production.edit")) return null;

  const handleMigrate = async () => {
    setRunning(true);
    setProgress("Starting…");
    setReport(null);
    try {
      const result = await migrateProjectProductionsToSupabase(
        preMigrationProductions || [],
        (msg) => setProgress(msg),
      );
      setReport(result);
      const failed = result.productions.filter(
        (r) => r.status === "failed",
      ).length;
      if (failed > 0) {
        toast.error(
          `Migration finished with ${failed} failed item(s) — see details below.`,
        );
      } else {
        toast.success("Production Stages migration finished successfully.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Migration failed to start.",
      );
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  const summarize = (items: ProductionMigrationItemResult[]) => ({
    migrated: items.filter((i) => i.status === "migrated").length,
    failed: items.filter((i) => i.status === "failed").length,
  });

  return (
    <Card data-ocid="settings.production_stages_migration.card">
      <CardHeader>
        <CardTitle className="text-base">Production Stages Migration</CardTitle>
        <p className="text-sm text-muted-foreground">
          One-time import of locally-stored Production Stages (and their
          Send/Receive transaction history) into Supabase. Safe to run more than
          once — every stage upserts by its existing id, never duplicated. Your
          local data is never modified or deleted by this action.
        </p>
        <p className="text-xs text-muted-foreground">
          {
            (preMigrationProductions || []).filter(
              (p) => (p.stages || []).length > 0,
            ).length
          }{" "}
          project(s) with stages found in this browser's local snapshot, taken
          before Production Stages started syncing to Supabase.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleMigrate}
            disabled={running}
            data-ocid="settings.production_stages_migration.run_button"
          >
            {running
              ? "Migrating…"
              : "Migrate Local Production Stages to Supabase"}
          </Button>
          {running && progress && (
            <span className="text-xs text-muted-foreground truncate max-w-xs">
              {progress}
            </span>
          )}
        </div>

        {report && (
          <div className="mt-4 space-y-3 text-sm">
            {(() => {
              const s = summarize(report.productions);
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium w-24">Projects:</span>
                  <Badge variant="secondary">{s.migrated} migrated</Badge>
                  {s.failed > 0 && (
                    <Badge variant="destructive">{s.failed} failed</Badge>
                  )}
                </div>
              );
            })()}

            {report.productions
              .filter((r) => r.status === "failed")
              .map((r) => (
                <p key={r.projectId} className="text-xs text-destructive">
                  {r.label}: {r.error}
                </p>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QmsInspectionsMigration() {
  const { currentUser } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [report, setReport] = useState<QmsInspectionMigrationReport | null>(
    null,
  );

  // Unlike Machines/Production Stages, this reads straight from IndexedDB
  // (never touched by Supabase hydration) — no pre-migration snapshot
  // capture is needed, it's safe to run at any time.
  if (!hasPermission(currentUser, "inspection_sheets.generate")) return null;

  const handleMigrate = async () => {
    setRunning(true);
    setProgress("Starting…");
    setReport(null);
    try {
      const result = await migrateQmsInspectionsToSupabase((msg) =>
        setProgress(msg),
      );
      setReport(result);
      const failed = [
        ...result.sheets,
        ...result.stageEntries,
        ...result.stageCompletions,
        ...result.documents,
        ...result.history,
      ].filter((r) => r.status === "failed").length;
      if (failed > 0) {
        toast.error(
          `Migration finished with ${failed} failed item(s) — see details below.`,
        );
      } else {
        toast.success("QMS Inspection data migration finished successfully.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Migration failed to start.",
      );
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  const summarize = (items: QmsMigrationItemResult[]) => ({
    migrated: items.filter((i) => i.status === "migrated").length,
    failed: items.filter((i) => i.status === "failed").length,
  });

  return (
    <Card data-ocid="settings.qms_inspections_migration.card">
      <CardHeader>
        <CardTitle className="text-base">
          QMS Inspection Data Migration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          One-time import of this browser's locally-stored Inspection Sheets,
          stage entries, stage completions, documents, and history into
          Supabase. Safe to run more than once — every item upserts by its
          existing id, never duplicated. Your local IndexedDB data is never
          modified or deleted by this action.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleMigrate}
            disabled={running}
            data-ocid="settings.qms_inspections_migration.run_button"
          >
            {running
              ? "Migrating…"
              : "Migrate Local QMS Inspection Data to Supabase"}
          </Button>
          {running && progress && (
            <span className="text-xs text-muted-foreground truncate max-w-xs">
              {progress}
            </span>
          )}
        </div>

        {report && (
          <div className="mt-4 space-y-3 text-sm">
            {(
              [
                ["Sheets", report.sheets],
                ["Stage Entries", report.stageEntries],
                ["Stage Completions", report.stageCompletions],
                ["Documents", report.documents],
                ["History", report.history],
              ] as const
            ).map(([label, items]) => {
              const s = summarize(items);
              if (s.migrated === 0 && s.failed === 0) return null;
              return (
                <div key={label} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium w-32">{label}:</span>
                  <Badge variant="secondary">{s.migrated} migrated</Badge>
                  {s.failed > 0 && (
                    <Badge variant="destructive">{s.failed} failed</Badge>
                  )}
                </div>
              );
            })}

            {[
              ...report.sheets,
              ...report.stageEntries,
              ...report.stageCompletions,
              ...report.documents,
              ...report.history,
            ]
              .filter((r) => r.status === "failed")
              .map((r) => (
                <p key={r.id} className="text-xs text-destructive">
                  {r.label}: {r.error}
                </p>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── User Management Component ─────────────────────────────────────────────────

const NEW_ROLES = [
  "admin",
  "sales",
  "procurement",
  "production",
  "quality",
  "dispatch",
  "accounts",
  "employee",
] as const;

interface UserFormState {
  username: string;
  password: string;
  role: string;
  permissions: Record<string, boolean>;
}

function PermissionMatrix({
  permissions,
  onChange,
  disabled = false,
}: {
  permissions: Record<string, boolean>;
  onChange: (perms: Record<string, boolean>) => void;
  /** True for a genuinely read-only preview (e.g. showing a role's
   * defaults before the user account exists to attach overrides to) -
   * renders real disabled checkboxes rather than clickable controls that
   * silently don't affect what's displayed, which is the bug this prop
   * was added to fix (see Settings -> Users completion report). */
  disabled?: boolean;
}) {
  const groups = getModulesByCategory();

  const toggle = (key: string) => {
    if (disabled) return;
    onChange({ ...permissions, [key]: !permissions[key] });
  };

  const setRow = (moduleKey: string, actions: string[], value: boolean) => {
    if (disabled) return;
    const updated = { ...permissions };
    for (const a of actions) {
      updated[`${moduleKey}.${a}`] = value;
    }
    onChange(updated);
  };

  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
      {Object.entries(groups).map(([category, modules]) => (
        <div key={category}>
          <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1 px-1">
            {category}
          </div>
          <div className="table-wrapper">
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-xs" style={{ minWidth: "400px" }}>
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium w-36">
                      Module
                    </th>
                    {[
                      "view",
                      "create",
                      "edit",
                      "delete",
                      "approve",
                      "download",
                      "print",
                      "share",
                    ].map((a) => (
                      <th
                        key={a}
                        className="text-center px-1 py-1.5 font-medium capitalize min-w-[52px]"
                      >
                        {a}
                      </th>
                    ))}
                    <th className="text-center px-1 py-1.5 font-medium w-16">
                      All
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((mod, idx) => {
                    const allChecked = mod.actions.every(
                      (a) => permissions[`${mod.key}.${a}`],
                    );
                    return (
                      <tr
                        key={mod.key}
                        className={
                          idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                        }
                      >
                        <td className="px-2 py-1.5 font-medium text-foreground whitespace-nowrap">
                          {mod.label}
                        </td>
                        {[
                          "view",
                          "create",
                          "edit",
                          "delete",
                          "approve",
                          "download",
                          "print",
                          "share",
                        ].map((a) => (
                          <td key={a} className="text-center px-1 py-1.5">
                            {mod.actions.includes(a) ? (
                              <Checkbox
                                checked={!!permissions[`${mod.key}.${a}`]}
                                onCheckedChange={() =>
                                  toggle(`${mod.key}.${a}`)
                                }
                                disabled={disabled}
                                className="h-3.5 w-3.5"
                              />
                            ) : (
                              <span className="text-muted-foreground/30">
                                —
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="text-center px-1 py-1.5">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(v) =>
                              setRow(mod.key, mod.actions, !!v)
                            }
                            disabled={disabled}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Priority 1: real Supabase-backed create/edit. Create only captures a
// temporary password (relayed to the new user out of band - never stored
// anywhere retrievable after this dialog closes); Edit only changes role
// + permission overrides, since Admin-driven password resets aren't part
// of this pass (see Settings -> Users completion report).
function UserDialog({
  open,
  onClose,
  onSaved,
  editUser,
  existingUsernames,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editUser: OrgUserRow | null;
  existingUsernames: string[];
}) {
  const { currentUser } = useAuth();
  // Monster-1 — user_roles_write's RLS policy requires users.assign_roles
  // specifically, distinct from users.edit (which only covers permission
  // overrides / profile fields — see user_permission_overrides_write and
  // profiles_write). This dialog used to gate the whole thing on
  // users.edit alone: a user granted .edit but not .assign_roles would
  // see the Role select, change it, and have setUserRole() silently
  // report "denied" from the RLS-blocked write.
  const canAssignRoles = hasPermission(currentUser, "users.assign_roles");
  const [form, setForm] = useState<UserFormState>({
    username: "",
    password: "",
    role: "sales",
    permissions: {},
  });
  const [defaults, setDefaults] = useState<Record<string, boolean>>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{
    username: string;
    password: string;
  } | null>(null);

  // (Re)load whenever the dialog opens, for either mode.
  useEffect(() => {
    if (!open) return;
    setCreated(null);
    if (editUser) {
      setForm({
        username: editUser.username,
        password: "",
        role: editUser.role,
        permissions: {},
      });
      applyRoleDefaults(editUser.role, editUser.id);
    } else {
      setForm({ username: "", password: "", role: "sales", permissions: {} });
      // Bug fix: this used to leave `defaults` empty until the admin
      // manually touched the Role dropdown, so the matrix rendered as an
      // all-unchecked, apparently-broken block on open. Load "sales"'s
      // real defaults immediately, same as edit mode does.
      applyRoleDefaults("sales");
    }
  }, [open, editUser]);

  const applyRoleDefaults = async (role: string, userId?: string) => {
    setLoadingPerms(true);
    try {
      const defaultsResult = await getRoleDefaultPermissions(role);
      const roleDefaults =
        defaultsResult.status === "success" ? defaultsResult.data || {} : {};
      let effective = { ...roleDefaults };
      if (userId) {
        const overridesResult = await listUserOverrides(userId);
        if (overridesResult.status === "success" && overridesResult.data) {
          effective = { ...effective, ...overridesResult.data };
        }
      }
      setDefaults(roleDefaults);
      setForm((f) => ({ ...f, role, permissions: effective }));
    } finally {
      setLoadingPerms(false);
    }
  };

  const handleRoleChange = (role: string) => {
    applyRoleDefaults(role, editUser?.id);
  };

  const handleSave = async () => {
    if (editUser) {
      setSaving(true);
      try {
        if (editUser.role !== form.role) {
          if (!canAssignRoles) {
            toast.error(
              "Access restricted: role-assignment permission required",
            );
            return;
          }
          const roleResult = await setUserRole(editUser.id, form.role);
          if (roleResult.status !== "success") {
            toast.error(roleResult.error || "Could not change role");
            return;
          }
        }
        const overridesResult = await saveUserOverrides(
          editUser.id,
          defaults,
          form.permissions,
        );
        if (overridesResult.status !== "success") {
          toast.error(
            overridesResult.error || "Could not save permission overrides",
          );
          return;
        }
        toast.success("User updated");
        onSaved();
        onClose();
      } finally {
        setSaving(false);
      }
      return;
    }

    const username = form.username.trim();
    if (!username) {
      toast.error("Username is required");
      return;
    }
    const conflict = existingUsernames.find(
      (n) => n.toLowerCase() === username.toLowerCase(),
    );
    if (conflict) {
      toast.error("Username already taken");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const result = await createOrgUser(username, form.password, form.role);
      if (result.status !== "success" || !result.data) {
        toast.error(result.error || "Could not create user");
        return;
      }
      toast.success("User created");
      setCreated({ username: result.data.username, password: form.password });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const copyCredentials = () => {
    if (!created) return;
    navigator.clipboard.writeText(
      `Username: ${created.username}\nTemporary password: ${created.password}`,
    );
    toast.success("Copied to clipboard");
  };

  if (created) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className="max-w-sm"
          data-ocid="settings.user.created_dialog"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-4 h-4" /> User Created
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Share these credentials with the new user. This is the only time
              the password is shown - it isn't stored anywhere retrievable after
              this. They'll be required to set their own password on first
              sign-in.
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs space-y-1">
              <div>Username: {created.username}</div>
              <div>Temporary password: {created.password}</div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={copyCredentials}
              data-ocid="settings.user.copy_credentials_button"
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Copy
            </Button>
            <Button
              size="sm"
              onClick={onClose}
              data-ocid="settings.user.created_done_button"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        data-ocid="settings.user.dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-4 h-4" />
            {editUser ? "Edit User" : "Create User"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Username *</Label>
              <Input
                data-ocid="settings.user_username.input"
                className="mt-1 h-8 text-sm"
                placeholder="johndoe"
                disabled={!!editUser}
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
              />
            </div>
            {!editUser && (
              <div>
                <Label className="text-xs">Temporary Password *</Label>
                <Input
                  data-ocid="settings.user_password.input"
                  className="mt-1 h-8 text-sm"
                  type="password"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Role *</Label>
              <Select
                value={form.role}
                onValueChange={handleRoleChange}
                disabled={!!editUser && !canAssignRoles}
              >
                <SelectTrigger
                  className="mt-1 h-8 text-sm"
                  data-ocid="settings.user_role.select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEW_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Permission matrix - Create mode shows what the chosen role
              grants by default; Edit mode is the live override editor. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" />
                {editUser ? "Permission Overrides" : "Role Default Permissions"}
                {loadingPerms && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
              {editUser && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => applyRoleDefaults(form.role)}
                  data-ocid="settings.user.reset_permissions_button"
                >
                  Reset to Role Defaults
                </Button>
              )}
            </div>
            {!editUser && (
              <p className="text-xs text-muted-foreground mb-2">
                Preview only — shows what the selected role grants by default.
                Per-user overrides can be configured after the account is
                created, by editing it from this list.
              </p>
            )}
            <PermissionMatrix
              permissions={editUser ? form.permissions : defaults}
              onChange={(perms) =>
                setForm((f) => ({ ...f, permissions: perms }))
              }
              disabled={!editUser}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            data-ocid="settings.user.cancel_button"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            data-ocid="settings.user.save_button"
          >
            {saving ? "Saving..." : editUser ? "Save Changes" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Administrator password reset — its own permission (users.reset_password),
 * deliberately distinct from users.edit (see permissions.ts's comment on the
 * same reasoning already applied to activate/deactivate). A standalone
 * dialog, not a section inside UserDialog: the Edit User entry point (the
 * row's pencil icon) is gated on users.edit specifically, so a user with
 * reset_password but not edit could never reach it if this lived inside
 * that dialog. This component exposes nothing else UserDialog does — no
 * role, no permission overrides, no username, no activation - only the
 * reset flow, triggered by its own row-level button, gated on its own
 * permission. Server-side (admin-reset-password Edge Function) re-checks
 * has_permission('users','reset_password') independently of whatever this
 * component renders - a tampered client can't skip it.
 */
function ResetPasswordDialog({
  user,
  open,
  onClose,
}: {
  user: OrgUserRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [newTempPassword, setNewTempPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [result, setResult] = useState<{
    password: string;
    mustChangePasswordError?: string;
    auditLogError?: string;
  } | null>(null);

  // Reset local state every time a new target opens - the password never
  // survives past this component's own lifetime, never touches
  // localStorage/Zustand/a DB field/audit metadata/a URL.
  useEffect(() => {
    if (!open) return;
    setConfirming(false);
    setNewTempPassword("");
    setResult(null);
  }, [open]);

  if (!user) return null;

  const handleReset = async () => {
    if (isResetting) return;
    if (newTempPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setIsResetting(true);
    try {
      const res = await resetUserPassword(user.id, newTempPassword);
      if (res.status !== "success") {
        toast.error(res.error || "Could not reset password");
        return;
      }
      setResult({
        password: newTempPassword,
        mustChangePasswordError: res.data?.mustChangePasswordError,
        auditLogError: res.data?.auditLogError,
      });
      setNewTempPassword("");
      setConfirming(false);
      if (res.data?.auditLogError) {
        toast.warning("Password reset, but the audit entry failed to record");
      } else {
        toast.success("Password reset");
      }
    } finally {
      setIsResetting(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    navigator.clipboard.writeText(
      `Username: ${user.username}\nNew temporary password: ${result.password}`,
    );
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-sm"
        data-ocid="settings.reset_password.dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Reset Password
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Share this with {user.username}. This is the only time it's shown
              - it isn't stored anywhere retrievable after this. They'll be
              required to set their own password on next sign-in.
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs space-y-1">
              <div>Username: {user.username}</div>
              <div>New temporary password: {result.password}</div>
            </div>
            {result.mustChangePasswordError && (
              <p
                className="text-xs text-warning"
                data-ocid="settings.reset_password.must_change_error"
              >
                ⚠ {result.mustChangePasswordError}
              </p>
            )}
            {result.auditLogError && (
              <p
                className="text-xs text-warning"
                data-ocid="settings.reset_password.audit_error"
              >
                ⚠ {result.auditLogError}
              </p>
            )}
          </div>
        ) : confirming ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              This immediately replaces {user.username}'s current password.
              They'll be forced to set their own on next sign-in.
            </p>
            <Input
              type="password"
              className="h-8 text-sm"
              placeholder="New temporary password (at least 8 characters)"
              value={newTempPassword}
              onChange={(e) => setNewTempPassword(e.target.value)}
              data-ocid="settings.reset_password.new_password_input"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Reset {user.username}'s password to a new temporary one? They'll be
            forced to set their own on next sign-in.
          </p>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={copyCredentials}
                data-ocid="settings.reset_password.copy_button"
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy
              </Button>
              <Button
                size="sm"
                onClick={onClose}
                data-ocid="settings.reset_password.done_button"
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                data-ocid="settings.reset_password.cancel_button"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isResetting}
                onClick={confirming ? handleReset : () => setConfirming(true)}
                data-ocid="settings.reset_password.confirm_button"
              >
                {isResetting
                  ? "Resetting..."
                  : confirming
                    ? "Confirm Reset"
                    : "Reset Password"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<OrgUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<OrgUserRow | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] =
    useState<OrgUserRow | null>(null);

  const refetch = () => {
    setLoading(true);
    listOrgUsers()
      .then((result) => {
        if (result.status === "success" && result.data) setUsers(result.data);
        else if (result.status !== "unauthenticated") {
          toast.error(result.error || "Could not load users");
        }
      })
      .finally(() => setLoading(false));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    refetch();
  }, []);

  const canViewUsers = hasPermission(currentUser, "users.view");
  const canEditUsers = hasPermission(currentUser, "users.edit");
  // DEFECT-4 — activation is governed by its own permissions, not by
  // users.edit. The database enforces this for real (profiles_write +
  // trg_enforce_profile_activation_permission, see
  // database/defect-4/); these two only keep the UI honest so a user
  // isn't offered a control the server will refuse.
  const canActivateUsers = hasPermission(currentUser, "users.activate");
  const canDeactivateUsers = hasPermission(currentUser, "users.deactivate");
  // Independently gated on its own permission, not users.edit - see
  // ResetPasswordDialog's own header comment for why this can't live
  // inside the edit-pencil's dialog.
  const canResetPasswordUsers = hasPermission(
    currentUser,
    "users.reset_password",
  );
  if (!canViewUsers) return null;

  const existingUsernames = users.map((u) => u.username);

  const openCreate = () => {
    setEditUser(null);
    setDialogOpen(true);
  };

  const openEdit = (user: OrgUserRow) => {
    setEditUser(user);
    setDialogOpen(true);
  };

  const handleToggleActive = async (user: OrgUserRow) => {
    if (user.id === currentUser?.id) {
      toast.error("Cannot deactivate your own account");
      return;
    }
    const result = await setUserActive(user.id, !user.isActive);
    if (result.status !== "success") {
      toast.error(result.error || "Could not update account status");
      return;
    }
    toast.success(
      `User "${user.username}" ${user.isActive ? "deactivated" : "reactivated"}`,
    );
    refetch();
  };

  // Role identity badges — categorical, not severity, so these use the
  // app's chart-1..5 tokens rather than success/warning/destructive.
  // Matches Layout.tsx's ROLE_BADGE map for the roles both files share.
  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-chart-4/15 text-chart-4",
    sales: "bg-chart-1/15 text-chart-1",
    procurement: "bg-chart-4/15 text-chart-4",
    production: "bg-chart-3/15 text-chart-3",
    quality: "bg-chart-2/15 text-chart-2",
    dispatch: "bg-chart-5/15 text-chart-5",
    accounts: "bg-chart-1/15 text-chart-1",
    employee: "bg-muted text-muted-foreground",
  };

  return (
    <>
      <Card data-ocid="settings.users.card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserCog className="w-4 h-4 text-violet-600" />
              User Management
            </CardTitle>
            {canEditUsers && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={openCreate}
                data-ocid="settings.users.open_modal_button"
              >
                <Plus className="w-3.5 h-3.5" /> New User
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="table-wrapper">
            <table className="w-full text-sm" style={{ minWidth: "500px" }}>
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">
                    Username
                  </th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">
                    Role
                  </th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">
                    Status
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                      <Loader2 className="w-4 h-4 animate-spin inline mr-1" />{" "}
                      Loading users...
                    </td>
                  </tr>
                )}
                {!loading && users.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                      data-ocid="settings.users.empty_state"
                    >
                      No users yet. Create the first user.
                    </td>
                  </tr>
                )}
                {!loading &&
                  users.map((user, idx) => (
                    <tr
                      key={user.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      data-ocid={`settings.users.item.${idx + 1}`}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {user.username}
                        {user.id === currentUser?.id && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            (you)
                          </span>
                        )}
                        {user.mustChangePassword && (
                          <span className="ml-1.5 text-[10px] text-warning">
                            (pending first login)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[user.role] || "bg-muted text-muted-foreground"}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {user.isActive ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success">
                            Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          {canEditUsers && (
                            <button
                              type="button"
                              onClick={() => openEdit(user)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              data-ocid={`settings.users.edit_button.${idx + 1}`}
                              title="Edit role & permissions"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canResetPasswordUsers && (
                            <button
                              type="button"
                              onClick={() => setResetPasswordTarget(user)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              data-ocid={`settings.users.reset_password_button.${idx + 1}`}
                              title="Reset password"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(user.isActive
                            ? canDeactivateUsers
                            : canActivateUsers) && (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(user)}
                              disabled={user.id === currentUser?.id}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              data-ocid={`settings.users.toggle_active_button.${idx + 1}`}
                              title={
                                user.isActive
                                  ? "Deactivate user"
                                  : "Reactivate user"
                              }
                            >
                              {user.isActive ? (
                                <PowerOff className="w-3.5 h-3.5" />
                              ) : (
                                <Power className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <UserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={refetch}
        editUser={editUser}
        existingUsernames={existingUsernames}
      />
      <ResetPasswordDialog
        user={resetPasswordTarget}
        open={!!resetPasswordTarget}
        onClose={() => setResetPasswordTarget(null)}
      />
    </>
  );
}

// ── Account Recovery Component (admin-only self-service, see chat) ─────────────
//
// Lets an administrator configure their OWN recovery email, used only by
// the public "Forgot password?" flow on the login screen when NO
// authenticated session exists at all — the case users.reset_password
// structurally cannot solve. Deliberately self-gating like every other
// component in this file: returns null for a non-admin `currentUser`,
// but that is only ever a convenience — recovery-email-setup/index.ts
// re-verifies is_admin server-side on every call regardless of what this
// component decided to render.
//
// Two-step, exactly mirroring the backend's own request/verify protocol:
// submitting a new address starts a 15-minute-lived verification code
// sent to that (new) address; only a correct code promotes it from
// "pending" to the actual active recovery_email. There is no path that
// marks an address active without that round trip.
function AccountRecoveryCard() {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<RecoveryEmailStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [newEmail, setNewEmail] = useState("");
  const [requesting, setRequesting] = useState(false);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const userId = currentUser?.id;

  useEffect(() => {
    if (!userId) return;
    setLoadingStatus(true);
    getMyRecoveryEmailStatus(userId)
      .then((result) => {
        if (result.status === "success" && result.data) setStatus(result.data);
      })
      .finally(() => setLoadingStatus(false));
  }, [userId]);

  const refreshStatus = async () => {
    if (!userId) return;
    const result = await getMyRecoveryEmailStatus(userId);
    if (result.status === "success" && result.data) setStatus(result.data);
  };

  if (currentUser?.role !== "admin") return null;

  const handleRequest = async () => {
    if (!newEmail.trim()) return;
    setRequesting(true);
    const result = await requestRecoveryEmailVerification(newEmail.trim());
    setRequesting(false);
    if (result.status !== "success") {
      toast.error(result.error || "Could not start verification.");
      return;
    }
    toast.success(`Verification code sent to ${newEmail.trim()}`);
    setNewEmail("");
    await refreshStatus();
  };

  const handleVerify = async () => {
    if (code.trim().length !== 6) return;
    setVerifying(true);
    const result = await confirmRecoveryEmail(code.trim());
    setVerifying(false);
    if (result.status !== "success") {
      toast.error(result.error || "Invalid or expired code.");
      return;
    }
    toast.success("Recovery email verified");
    setCode("");
    await refreshStatus();
  };

  return (
    <Card data-ocid="settings.account_recovery.card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="w-4 h-4" />
          Account Recovery
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Administrators only. A verified recovery email lets you regain access
          via "Forgot password?" on the login screen, even if no other
          administrator is available to reset it for you.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingStatus ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            {status?.recoveryEmail && status.recoveryEmailVerifiedAt && (
              <div
                className="flex items-center gap-2 text-sm text-success"
                data-ocid="settings.account_recovery.verified_status"
              >
                <CheckCircle2 className="w-4 h-4" />
                Verified: {status.recoveryEmail}
              </div>
            )}
            {!status?.recoveryEmail && !status?.recoveryEmailPending && (
              <p className="text-sm text-muted-foreground">
                No recovery email configured yet.
              </p>
            )}

            {status?.recoveryEmailPending ? (
              <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  A verification code was sent to{" "}
                  <span className="font-medium text-foreground">
                    {status.recoveryEmailPending}
                  </span>
                  . Enter it below to confirm this address.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    className="max-w-[10rem]"
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    data-ocid="settings.account_recovery.code_input"
                  />
                  <Button
                    size="sm"
                    disabled={verifying || code.trim().length !== 6}
                    onClick={handleVerify}
                    data-ocid="settings.account_recovery.verify_button"
                  >
                    {verifying ? "Verifying..." : "Verify"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  placeholder={
                    status?.recoveryEmail
                      ? "Change recovery email..."
                      : "you@example.com"
                  }
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  data-ocid="settings.account_recovery.email_input"
                />
                <Button
                  size="sm"
                  disabled={requesting || !newEmail.trim()}
                  onClick={handleRequest}
                  data-ocid="settings.account_recovery.request_button"
                >
                  {requesting ? "Sending..." : "Send code"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Security Audit Log Component ──────────────────────────────────────────────
//
// Read-only viewer for security_audit_log (phase1_auth_permissions_rls_v5_
// FINAL.sql §9) — password-change events plus every Agent action (proposed/
// confirmed/executed/blocked/failed, see agent/audit.ts). The table has
// always had data written to it (log_security_event RPC) but no viewer
// anywhere in the app; audit_log.view was also missing from
// MODULE_PERMISSIONS entirely (see the comment on that entry in
// permissions.ts), so nothing could gate or grant this view either.
// Mirrors UserManagement's own self-gating shape exactly: returns null if
// the current user lacks the permission, rather than the caller checking.

function SecurityAuditLog() {
  const { currentUser } = useAuth();
  const [entries, setEntries] = useState<SecurityAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSecurityAuditLog()
      .then((result) => {
        if (result.status === "success" && result.data) {
          setEntries(result.data);
        } else if (result.status !== "unauthenticated") {
          toast.error(result.error || "Could not load the audit log");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (!canView(currentUser, "audit_log")) return null;

  return (
    <Card data-ocid="settings.audit_log.card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-violet-600" />
          Security Audit Log
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Password-change events and every Agent action (proposed, confirmed,
          executed, blocked, or failed). Most recent 200 events.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">
            No audit events recorded yet.
          </p>
        ) : (
          <div className="table-wrapper">
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Time</th>
                    <th className="text-left px-2 py-1.5 font-medium">Event</th>
                    <th className="text-left px-2 py-1.5 font-medium">Actor</th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      Target
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, idx) => (
                    <tr
                      key={entry.id}
                      className="border-t"
                      data-ocid={`settings.audit_log.row.${idx + 1}`}
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString("en-IN")}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {entry.eventType}
                      </td>
                      <td className="px-2 py-1.5">
                        {entry.actorUsername || entry.actorUserId || "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {entry.targetUsername || entry.targetUserId || "—"}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground max-w-xs truncate">
                        {Object.keys(entry.metadata).length > 0
                          ? JSON.stringify(entry.metadata)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
