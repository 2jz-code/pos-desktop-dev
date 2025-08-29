import React from 'react';

interface SimpleTimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// Pre-generated common business hours (much shorter list)
const BUSINESS_HOURS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00', '22:30', '23:00'
];

const formatTime12Hour = (time24: string) => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour12 = parseInt(hours) % 12 || 12;
  const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${ampm}`;
};

export const SimpleTimeSelect = React.memo(({ value, onChange, disabled }: SimpleTimeSelectProps) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-32 h-8 text-sm bg-transparent border-none outline-none cursor-pointer hover:bg-muted/50 rounded px-2"
    >
      <option value="">Select time</option>
      {BUSINESS_HOURS.map(time => (
        <option key={time} value={time}>
          {formatTime12Hour(time)}
        </option>
      ))}
    </select>
  );
});

SimpleTimeSelect.displayName = 'SimpleTimeSelect';