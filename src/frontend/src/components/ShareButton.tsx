import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mail, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";

interface ShareButtonProps {
  type: string;
  id: string;
  number: string;
  disabled?: boolean;
}

function getRoute(type: string): string {
  if (type.toLowerCase().includes("quotation")) return "quotations";
  if (type.toLowerCase().includes("invoice")) return "invoices";
  return "company-po";
}

export default function ShareButton({
  type,
  id,
  number,
  disabled,
}: ShareButtonProps) {
  const [open, setOpen] = useState(false);

  const url = `${window.location.origin}/app/${getRoute(type)}/${id}`;

  const handleWhatsApp = () => {
    const message = `Hello, please find the document:\n\n${type}: ${number}\n\nLink: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleGmail = () => {
    const subject = encodeURIComponent(`${type} - ${number}`);
    const body = encodeURIComponent(
      `Please find the document.\n\nLink: ${url}`,
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-ocid="share.open_modal_button"
      >
        <Share2 className="w-4 h-4 mr-1" /> Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" data-ocid="share.modal">
          <DialogHeader>
            <DialogTitle>Share Document</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <Button
              className="bg-green-600 hover:bg-green-700 text-white w-full justify-start gap-3"
              onClick={handleWhatsApp}
              data-ocid="share.whatsapp.button"
            >
              <MessageCircle className="w-5 h-5" />
              Share via WhatsApp
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={handleGmail}
              data-ocid="share.gmail.button"
            >
              <Mail className="w-5 h-5" />
              Share via Gmail
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              data-ocid="share.close_button"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
