import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extractPhoneNumberValue(input: string) {
  const trimmed = input.trim()

  if (!trimmed.startsWith("{")) {
    return trimmed
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === "object" && typeof parsed.value === "string") {
      return parsed.value.trim()
    }
  } catch {
    return trimmed
  }

  return trimmed
}

export function normalizePhoneNumber(input: string) {
  const rawValue = extractPhoneNumberValue(input)
  if (!rawValue) return null

  const digits = rawValue.replace(/\D/g, "")
  const hasPlusPrefix = rawValue.startsWith("+")

  if (hasPlusPrefix) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }

  if (digits.length === 10) {
    return `+1${digits}`
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`
  }

  return null
}
