import { Button } from "@/components/ui/button";
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
import {
  type ConnectImapSmtpInput,
  connectImapSmtpAccount,
  startGoogleOAuth,
} from "@/lib/emailAccountsApi";
// FabFlow Email Integration — the "address → detect → connect" flow.
// Product requirement: manual IMAP/SMTP server entry is NOT the normal
// path. The default flow is email address → detected provider →
// authentication automatically selected → Connect. Manual host/port entry
// only appears for a genuinely unrecognized provider ("manual" step), or
// as an explicit "Advanced / Custom IMAP configuration" override from the
// known-provider step — never as the default. Plain useState form state
// throughout, matching every other form in this codebase (JobCards.tsx,
// Payables.tsx, Settings.tsx) — no react-hook-form.
import {
  DEFAULT_IMAP_PORTS,
  DEFAULT_SMTP_PORTS,
  type ProviderDetectionResult,
  detectProviderLocal,
  detectProviderRemote,
} from "@/lib/emailProviderDetection";
import type { EmailEncryption } from "@/types";
import { AlertTriangle, Loader2, Mail, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

type Step = "address" | "detecting" | "oauth" | "known" | "manual";

const ENCRYPTION_OPTIONS: EmailEncryption[] = ["ssl", "starttls", "none"];

export function ConnectEmailAccountDialog({
  open,
  onOpenChange,
  onConnected,
}: Props) {
  const [step, setStep] = useState<Step>("address");
  const [emailAddress, setEmailAddress] = useState("");
  const [detection, setDetection] = useState<ProviderDetectionResult | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  // Where the manual form's "Back" button should return to — "address" for
  // a genuinely unrecognized provider, "known" when the user opened manual
  // config as an override of an auto-detected known provider.
  const [manualBackTarget, setManualBackTarget] = useState<"address" | "known">(
    "address",
  );
  // The known-provider step's minimal credential form — only ever
  // username + password, since the server settings are already known.
  const [knownCreds, setKnownCreds] = useState({ username: "", password: "" });

  const [manual, setManual] = useState<
    Omit<ConnectImapSmtpInput, "emailAddress">
  >({
    displayName: "",
    imapHost: "",
    imapPort: DEFAULT_IMAP_PORTS.ssl,
    imapEncryption: "ssl",
    smtpHost: "",
    smtpPort: DEFAULT_SMTP_PORTS.starttls,
    smtpEncryption: "starttls",
    username: "",
    password: "",
    syncWindowDays: 30,
  });

  const reset = () => {
    setStep("address");
    setEmailAddress("");
    setDetection(null);
    setManualBackTarget("address");
    setKnownCreds({ username: "", password: "" });
    setManual((m) => ({ ...m, username: "", password: "", displayName: "" }));
  };

  const handleDetect = async () => {
    const trimmed = emailAddress.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setStep("detecting");
    const local = detectProviderLocal(trimmed);
    const result = local ?? (await detectProviderRemote(trimmed));
    setDetection(result);
    setManual((m) => ({ ...m, username: trimmed }));
    setKnownCreds({ username: trimmed, password: "" });
    // Phase 9F — Google still gets its own "oauth" step (OAuth is the
    // preferred, working path there; that step now also offers the
    // pre-filled IMAP/SMTP fallback below instead of a blank manual form).
    // Microsoft has no OAuth flow at all yet, so it now routes straight to
    // "known" — the same pre-filled password-only step Hostinger/Zoho
    // already use — rather than a disabled OAuth button leading nowhere.
    if (result.provider === "google") {
      setStep("oauth");
    } else if (result.knownProvider) {
      setStep("known");
    } else {
      setManualBackTarget("address");
      setStep("manual");
    }
  };

  // Phase 9E — Google only; Microsoft's authorization-code flow isn't
  // implemented yet, so its button stays disabled below. No separate
  // "is OAuth configured" check endpoint: email-oauth-start itself
  // returns a clear 501/error when GOOGLE_OAUTH_CLIENT_ID/SECRET aren't
  // set, which surfaces here as the same toast + fall-back-to-manual
  // path that already existed for "not configured yet".
  const handleGoogleOAuth = async () => {
    const trimmed = emailAddress.trim();
    setBusy(true);
    const result = await startGoogleOAuth(trimmed);
    setBusy(false);
    if (result.status !== "success" || !result.data) {
      toast.error(result.error || "Could not start Google sign-in.");
      return;
    }
    window.location.href = result.data.authorizeUrl;
  };

  const handleConnectKnown = async () => {
    if (!detection?.knownProvider) return;
    const cfg = detection.knownProvider.config;
    setBusy(true);
    const result = await connectImapSmtpAccount({
      emailAddress: emailAddress.trim(),
      imapHost: cfg.imapHost,
      imapPort: cfg.imapPort,
      imapEncryption: cfg.imapEncryption,
      smtpHost: cfg.smtpHost,
      smtpPort: cfg.smtpPort,
      smtpEncryption: cfg.smtpEncryption,
      username: knownCreds.username,
      password: knownCreds.password,
      syncWindowDays: 30,
    });
    setBusy(false);
    if (result.status !== "success") {
      toast.error(result.error || "Could not connect this mailbox.");
      return;
    }
    toast.success(`Connected ${emailAddress.trim()}`);
    reset();
    onOpenChange(false);
    onConnected();
  };

  /** "Advanced / Custom IMAP configuration" from the known-provider step —
   * pre-fills the manual form with the registry's own settings (still
   * editable) rather than starting the user from a blank form. */
  const handleUseAdvanced = () => {
    if (detection?.knownProvider) {
      const cfg = detection.knownProvider.config;
      setManual((m) => ({
        ...m,
        username: knownCreds.username,
        password: knownCreds.password,
        imapHost: cfg.imapHost,
        imapPort: cfg.imapPort,
        imapEncryption: cfg.imapEncryption,
        smtpHost: cfg.smtpHost,
        smtpPort: cfg.smtpPort,
        smtpEncryption: cfg.smtpEncryption,
      }));
    }
    setManualBackTarget("known");
    setStep("manual");
  };

  const handleConnect = async () => {
    setBusy(true);
    const result = await connectImapSmtpAccount({
      emailAddress: emailAddress.trim(),
      ...manual,
    });
    setBusy(false);
    if (result.status !== "success") {
      toast.error(result.error || "Could not connect this mailbox.");
      return;
    }
    toast.success(`Connected ${emailAddress.trim()}`);
    reset();
    onOpenChange(false);
    onConnected();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" data-ocid="email.connect_dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            Connect Email Account
          </DialogTitle>
        </DialogHeader>

        {step === "address" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email-connect-address" className="text-xs">
                Email address
              </Label>
              <Input
                id="email-connect-address"
                placeholder="accounts@company.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleDetect();
                }}
                data-ocid="email.connect_dialog.address_input"
              />
            </div>
            <DialogFooter>
              <Button
                onClick={() => void handleDetect()}
                data-ocid="email.connect_dialog.continue_button"
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "detecting" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Detecting provider…
          </div>
        )}

        {step === "oauth" && detection && (
          // Reached for Google only (see handleDetect) — Microsoft has no
          // OAuth flow yet and routes straight to the "known" step instead.
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Provider detected
              </p>
              <p className="text-sm font-semibold">Google Workspace / Gmail</p>
              <p className="text-xs text-muted-foreground">
                {detection.reason}
              </p>
            </div>
            <DialogFooter className="flex-col sm:flex-col gap-2 items-stretch">
              <Button
                disabled={busy}
                onClick={() => void handleGoogleOAuth()}
                data-ocid="email.connect_dialog.oauth_button"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Continue with Google
              </Button>
              {detection.knownProvider && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setStep("known")}
                  data-ocid="email.connect_dialog.oauth_app_password_button"
                >
                  Use App Password instead (IMAP/SMTP)
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={
                  detection.knownProvider
                    ? handleUseAdvanced
                    : () => {
                        setManualBackTarget("address");
                        setStep("manual");
                      }
                }
              >
                Configure manually (IMAP/SMTP)
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "known" && detection?.knownProvider && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Provider detected
              </p>
              <p className="text-sm font-semibold">
                {detection.knownProvider.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {detection.reason}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Username</Label>
              <Input
                value={knownCreds.username}
                onChange={(e) =>
                  setKnownCreds((k) => ({ ...k, username: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password / App Password</Label>
              <Input
                type="password"
                value={knownCreds.password}
                onChange={(e) =>
                  setKnownCreds((k) => ({ ...k, password: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleConnectKnown();
                }}
                data-ocid="email.connect_dialog.known_password_input"
              />
            </div>
            {detection.knownProvider.credentialHint ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{detection.knownProvider.credentialHint}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                FabFlow already knows {detection.knownProvider.label}'s mail
                server settings — you only need your mailbox password. Sent
                once, directly to FabFlow's server, encrypted, and never stored
                in your browser.
              </p>
            )}
            <DialogFooter className="flex-col sm:flex-col gap-2 items-stretch">
              <Button
                onClick={() => void handleConnectKnown()}
                disabled={busy || !knownCreds.username || !knownCreds.password}
                data-ocid="email.connect_dialog.known_connect_button"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Connect"
                )}
              </Button>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("address")}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleUseAdvanced}
                  disabled={busy}
                  className="gap-1"
                >
                  <Settings2 className="w-3 h-3" />
                  Advanced / Custom IMAP configuration
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}

        {step === "manual" && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {detection?.knownProvider ? (
              <p className="text-xs text-muted-foreground">
                Advanced: customize the connection settings FabFlow detected for{" "}
                {detection.knownProvider.label}.
              </p>
            ) : detection && detection.provider === "generic" ? (
              <p className="text-xs text-muted-foreground">
                Provider could not be identified automatically.{" "}
                {detection.reason}
                {detection.mxHosts?.length
                  ? ` Mail servers: ${detection.mxHosts.join(", ")}.`
                  : ""}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Display name (optional)</Label>
                <Input
                  value={manual.displayName}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, displayName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Username</Label>
                <Input
                  value={manual.username}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, username: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Password / App Password</Label>
                <Input
                  type="password"
                  value={manual.password}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, password: e.target.value }))
                  }
                  data-ocid="email.connect_dialog.password_input"
                />
              </div>

              <div className="col-span-2 text-xs font-semibold text-muted-foreground pt-1">
                Incoming (IMAP)
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">IMAP server</Label>
                <Input
                  value={manual.imapHost}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, imapHost: e.target.value }))
                  }
                  placeholder="imap.example.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Port</Label>
                <Input
                  type="number"
                  value={manual.imapPort}
                  onChange={(e) =>
                    setManual((m) => ({
                      ...m,
                      imapPort: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Encryption</Label>
                <Select
                  value={manual.imapEncryption}
                  onValueChange={(v: EmailEncryption) =>
                    setManual((m) => ({
                      ...m,
                      imapEncryption: v,
                      imapPort: DEFAULT_IMAP_PORTS[v],
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENCRYPTION_OPTIONS.map((enc) => (
                      <SelectItem key={enc} value={enc}>
                        {enc.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 text-xs font-semibold text-muted-foreground pt-1">
                Outgoing (SMTP)
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">SMTP server</Label>
                <Input
                  value={manual.smtpHost}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, smtpHost: e.target.value }))
                  }
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Port</Label>
                <Input
                  type="number"
                  value={manual.smtpPort}
                  onChange={(e) =>
                    setManual((m) => ({
                      ...m,
                      smtpPort: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Encryption</Label>
                <Select
                  value={manual.smtpEncryption}
                  onValueChange={(v: EmailEncryption) =>
                    setManual((m) => ({
                      ...m,
                      smtpEncryption: v,
                      smtpPort: DEFAULT_SMTP_PORTS[v],
                    }))
                  }
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENCRYPTION_OPTIONS.map((enc) => (
                      <SelectItem key={enc} value={enc}>
                        {enc.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your password is sent once, directly to FabFlow's server,
              encrypted, and never stored in your browser or shown again.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep(manualBackTarget)}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                onClick={() => void handleConnect()}
                disabled={
                  busy ||
                  !manual.imapHost ||
                  !manual.smtpHost ||
                  !manual.password
                }
                data-ocid="email.connect_dialog.save_button"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
