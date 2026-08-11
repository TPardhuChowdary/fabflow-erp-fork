import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function CharacteristicSearchBar({ value, onChange }: Props) {
  return (
    <div className="relative flex-1 min-w-[240px]">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search name, description, category, process, standard, tags..."
        className="h-8 text-sm pl-8"
        data-ocid="qms.characteristics.search"
      />
    </div>
  );
}
