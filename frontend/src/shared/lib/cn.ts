import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Compõe classes Tailwind condicionalmente, resolvendo conflitos (a última
 * utilitária vence). Use em todo componente novo no lugar do `cx` legado.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
