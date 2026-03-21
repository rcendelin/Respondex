// Shared result type for XLSX parsing operations

export interface ParseError {
  /** 1-based row number in the XLSX sheet (2 = first data row after header) */
  row?: number
  /** Column name as it appears in the XLSX header */
  column?: string
  /** Human-readable error message in Czech */
  message: string
}

export interface ParseResult<T> {
  success: boolean
  data?: T
  errors: ParseError[]
}

export function parseSuccess<T>(data: T): ParseResult<T> {
  return { success: true, data, errors: [] }
}

export function parseFailure<T>(errors: ParseError[]): ParseResult<T> {
  return { success: false, errors }
}
