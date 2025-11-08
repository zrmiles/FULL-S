export type View = "login" | "home" | "poll" | "success" | "results" | "organizer" | "profile";

export interface PollCardProps {
  title: string;
  meta: string;
  description: string;
  status: { label: string; tone: "blue" | "amber" | "gray" };
  onPrimary: () => void;
  onSecondary: () => void;
  onDelete?: () => void;
}

export interface AppBarProps {
  onNav: (view: View) => void;
  current: View;
}

export interface NavBtnProps {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}

export interface HeaderRowProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export interface LabelledInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  min?: string;
}

