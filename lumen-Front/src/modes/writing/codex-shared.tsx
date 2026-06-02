import { CircleUser, MapPin, Package, CalendarDays, Lightbulb, Building2 } from "lucide-react";

export const TYPE_ICONS: Record<string, React.ReactNode> = {
  character: <CircleUser className="w-4 h-4 opacity-75" />,
  location: <MapPin className="w-4 h-4 opacity-75" />,
  item: <Package className="w-4 h-4 opacity-75" />,
  event: <CalendarDays className="w-4 h-4 opacity-75" />,
  concept: <Lightbulb className="w-4 h-4 opacity-75" />,
  organization: <Building2 className="w-4 h-4 opacity-75" />,
};

export const TYPE_LABELS: Record<string, string> = {
  character: "Character",
  location: "Location",
  item: "Item",
  event: "Event",
  concept: "Concept",
  organization: "Organization",
};
