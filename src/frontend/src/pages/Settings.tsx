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
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Copy,
  Edit2,
  Eye,
  Info,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Plus,
  Power,
  PowerOff,
  Settings as SettingsIcon,
  Shield,
  UserCog,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { CompanyProfilePrintView } from "../components/CompanyProfilePrintView";
import {
  type MigrationItemResult,
  type MigrationReport,
  migrateDrawingRepositoryToSupabase,
} from "../drawingEditor/lib/migrateToSupabase";
import {
  type OrgUserRow,
  createOrgUser,
  getRoleDefaultPermissions,
  listOrgUsers,
  listUserOverrides,
  saveUserOverrides,
  setUserActive,
  setUserRole,
} from "../lib/settingsUsersApi";
import { canView, hasPermission } from "../permissions";
import { getModulesByCategory } from "../permissions";
import { useStore } from "../store";
import type { AppSettings } from "../types";

export function Settings() {
  const { currentUser } = useAuth();
  const { settings, updateSettings } = useStore();

  const [showCompanyPreview, setShowCompanyPreview] = useState(false);

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

  const [whatsappForm, setWhatsappForm] = useState({
    twilioAccountSid: settings.twilioAccountSid,
    twilioAuthToken: settings.twilioAuthToken,
    twilioFromNumber: settings.twilioFromNumber,
  });

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

  const whatsappConfigured =
    whatsappForm.twilioAccountSid.trim() !== "" &&
    whatsappForm.twilioAuthToken.trim() !== "" &&
    whatsappForm.twilioFromNumber.trim() !== "";

  const emailConfigured =
    emailForm.gmailSenderEmail.trim() !== "" &&
    emailForm.gmailAppPassword.trim() !== "";

  const handleSaveCompany = () => {
    updateSettings({ ...settings, ...companyForm });
    toast.success("Company profile saved");
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
              <Building2 className="w-4 h-4 text-blue-600" />
              Company Profile
            </CardTitle>
            {companyConfigured ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
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
              data-ocid="settings.company.save_button"
            >
              Save Company Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp / Twilio */}
      <Card data-ocid="settings.whatsapp.card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-green-600" />
              WhatsApp Reminders (via Twilio)
            </CardTitle>
            {whatsappConfigured ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
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
          <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3">
            <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              Credentials are stored locally in the browser. For production,
              ensure your environment has proper CORS handling for Twilio API
              calls. Get your credentials from{" "}
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

      {/* Gmail SMTP */}
      <Card data-ocid="settings.email.card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4 text-red-500" />
              Email Reminders (Gmail SMTP)
            </CardTitle>
            {emailConfigured ? (
              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
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
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
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
              Verification on your Google account first. Email delivery requires
              a server-side SMTP relay for production.
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

      {/* Backup & Restore */}
      <BackupRestore />

      {/* Drawing Repository migration (Phase 14, one-time, self-service) */}
      <DrawingRepositoryMigration />

      {/* User Management */}
      <UserManagement />

      {/* Company Profile Preview Modal */}
      <CompanyProfilePrintView
        open={showCompanyPreview}
        onClose={() => setShowCompanyPreview(false)}
      />
    </div>
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
      qualityInspections: store.qualityInspections || [],
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
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleExport}
              data-ocid="settings.backup.primary_button"
            >
              Export Backup
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              data-ocid="settings.restore.secondary_button"
            >
              Restore Data
            </Button>
          </div>
          <p className="text-xs text-destructive mt-3">
            ⚠ Restoring will replace all current data permanently.
          </p>
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
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
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
              <Select value={form.role} onValueChange={handleRoleChange}>
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

function UserManagement() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<OrgUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<OrgUserRow | null>(null);

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

  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-red-100 text-red-700",
    sales: "bg-emerald-100 text-emerald-700",
    procurement: "bg-orange-100 text-orange-700",
    production: "bg-yellow-100 text-yellow-700",
    quality: "bg-cyan-100 text-cyan-700",
    dispatch: "bg-indigo-100 text-indigo-700",
    accounts: "bg-blue-100 text-blue-700",
    employee: "bg-gray-100 text-gray-700",
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
                          <span className="ml-1.5 text-[10px] text-amber-600">
                            (pending first login)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700"}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {user.isActive ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
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
                          {canEditUsers && (
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
    </>
  );
}
