export type Frequency = 'once' | 'monthly' | 'yearly'
export type Strategy = 'term' | 'payment'

export type LoanTerms = {
  propertyPrice: number
  downPayment: number
  annualRate: number
  years: number
  issueDate: string
  firstPaymentDate: string
}

export type PrepaymentPlan = {
  id: string
  amount: number
  frequency: Frequency
  strategy: Strategy
  startDate: string
  endDate: string
  enabled: boolean
}

export type ScheduleRow = {
  id: string
  date: string
  type: 'regular' | 'prepayment'
  regularPayment: number
  extraPayment: number
  totalPayment: number
  interest: number
  regularPrincipal: number
  extraPrincipal: number
  balance: number
  paymentAfter: number
  remainingMonths: number
  strategy?: Strategy
}

export type ScenarioResult = {
  principal: number
  monthlyPayment: number
  currentPayment: number
  totalInterest: number
  totalPaid: number
  totalExtra: number
  regularPrincipal: number
  extraPrincipal: number
  payoffDate: Date
  durationMonths: number
  maxMonthlyPayment: number
  schedule: ScheduleRow[]
  conflicts: string[]
}

const DAY_MS = 86_400_000
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function parseIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

export function addMonthsAnchored(date: Date, months: number): Date {
  const day = date.getUTCDate()
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  target.setUTCDate(Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())))
  return target
}

function addYearsAnchored(date: Date, years: number): Date {
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  return new Date(Date.UTC(date.getUTCFullYear() + years, month, Math.min(day, daysInMonth(date.getUTCFullYear() + years, month))))
}

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function yearFractionActualActual(fromExclusive: Date, toInclusive: Date): number {
  if (toInclusive <= fromExclusive) return 0
  let cursor = new Date(fromExclusive.getTime() + DAY_MS)
  let fraction = 0
  while (cursor <= toInclusive) {
    const year = cursor.getUTCFullYear()
    const endOfYear = new Date(Date.UTC(year, 11, 31))
    const segmentEnd = endOfYear < toInclusive ? endOfYear : toInclusive
    const days = Math.round((segmentEnd.getTime() - cursor.getTime()) / DAY_MS) + 1
    fraction += days / (isLeap(year) ? 366 : 365)
    cursor = new Date(segmentEnd.getTime() + DAY_MS)
  }
  return fraction
}

function interestFor(balance: number, annualRate: number, from: Date, to: Date): number {
  return round2(balance * (annualRate / 100) * yearFractionActualActual(from, to))
}

function regularDates(terms: LoanTerms): Date[] {
  const count = Math.max(1, Math.round(terms.years * 12))
  const first = parseIso(terms.firstPaymentDate)
  return Array.from({ length: count }, (_, index) => addMonthsAnchored(first, index))
}

function balanceAfterPayments(balance: number, accrued: number, annualRate: number, from: Date, dates: Date[], payment: number): number {
  let currentBalance = balance
  let currentAccrued = accrued
  let previous = from
  for (const date of dates) {
    currentAccrued = round2(currentAccrued + interestFor(currentBalance, annualRate, previous, date))
    const actual = Math.min(payment, currentBalance + currentAccrued)
    const interestPaid = Math.min(currentAccrued, actual)
    currentAccrued = round2(currentAccrued - interestPaid)
    currentBalance = round2(Math.max(0, currentBalance - (actual - interestPaid)))
    previous = date
  }
  return currentBalance + currentAccrued
}

function solvePayment(balance: number, accrued: number, annualRate: number, from: Date, dates: Date[]): number {
  if (balance <= 0 || dates.length === 0) return 0
  let low = Math.max(0, balance / dates.length)
  let high = Math.max(balance * 2 + accrued, 1)
  for (let index = 0; index < 90; index += 1) {
    const middle = (low + high) / 2
    if (balanceAfterPayments(balance, accrued, annualRate, from, dates, middle) > 0) low = middle
    else high = middle
  }
  return round2(high)
}

function planDates(plan: PrepaymentPlan, lastDate: Date): Date[] {
  if (!plan.enabled || plan.amount <= 0 || !plan.startDate) return []
  const start = parseIso(plan.startDate)
  const end = plan.endDate ? parseIso(plan.endDate) : lastDate
  if (start > end || start > lastDate) return []
  if (plan.frequency === 'once') return [start]
  const result: Date[] = []
  for (let index = 0; index < 1_200; index += 1) {
    const date = plan.frequency === 'monthly' ? addMonthsAnchored(start, index) : addYearsAnchored(start, index)
    if (date > end || date > lastDate) break
    result.push(date)
  }
  return result
}

function durationMonths(from: Date, to: Date): number {
  const raw = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth()
  return Math.max(0, raw + (to.getUTCDate() > from.getUTCDate() ? 1 : 0))
}

export function calculateScenario(terms: LoanTerms, plans: PrepaymentPlan[] = []): ScenarioResult {
  const principal = round2(Math.max(0, terms.propertyPrice - terms.downPayment))
  const dates = regularDates(terms)
  const issueDate = parseIso(terms.issueDate)
  const lastScheduledDate = dates.at(-1) ?? issueDate
  const originalPayment = solvePayment(principal, 0, terms.annualRate, issueDate, dates)

  const mandatory = new Map(dates.map((date, index) => [toIso(date), index]))
  const extras = new Map<string, { amount: number; strategies: Set<Strategy> }>()
  for (const plan of plans) {
    for (const date of planDates(plan, lastScheduledDate)) {
      if (date <= issueDate) continue
      const key = toIso(date)
      const current = extras.get(key) ?? { amount: 0, strategies: new Set<Strategy>() }
      current.amount = round2(current.amount + plan.amount)
      current.strategies.add(plan.strategy)
      extras.set(key, current)
    }
  }

  const eventDates = [...new Set([...mandatory.keys(), ...extras.keys()])].sort()
  const conflicts = [...extras.entries()].filter(([, extra]) => extra.strategies.size > 1).map(([date]) => date)
  let balance = principal
  let accrued = 0
  let previousDate = issueDate
  let currentPayment = originalPayment
  const rows: ScheduleRow[] = []
  let totalInterest = 0
  let totalExtra = 0
  let regularPrincipal = 0
  let extraPrincipal = 0

  for (const iso of eventDates) {
    if (balance <= 0.005 && accrued <= 0.005) break
    const date = parseIso(iso)
    accrued = round2(accrued + interestFor(balance, terms.annualRate, previousDate, date))
    const mandatoryIndex = mandatory.get(iso)

    if (mandatoryIndex !== undefined && balance + accrued > 0) {
      const actualPayment = round2(Math.min(currentPayment, balance + accrued))
      const interestPaid = round2(Math.min(accrued, actualPayment))
      const principalPaid = round2(Math.min(balance, actualPayment - interestPaid))
      accrued = round2(Math.max(0, accrued - interestPaid))
      balance = round2(Math.max(0, balance - principalPaid))
      totalInterest = round2(totalInterest + interestPaid)
      regularPrincipal = round2(regularPrincipal + principalPaid)
      rows.push({ id: `${iso}-regular`, date: iso, type: 'regular', regularPayment: actualPayment, extraPayment: 0, totalPayment: actualPayment, interest: interestPaid, regularPrincipal: principalPaid, extraPrincipal: 0, balance, paymentAfter: currentPayment, remainingMonths: 0 })
    }

    const extra = extras.get(iso)
    if (extra && balance > 0 && extra.strategies.size === 1) {
      const strategy = [...extra.strategies][0]
      const closesLoan = extra.amount >= round2(balance + accrued)
      const interestPaid = closesLoan ? accrued : 0
      const principalPaid = closesLoan ? balance : round2(Math.min(extra.amount, balance))
      const actualExtra = round2(principalPaid + interestPaid)
      balance = round2(Math.max(0, balance - principalPaid))
      accrued = round2(Math.max(0, accrued - interestPaid))
      totalInterest = round2(totalInterest + interestPaid)
      totalExtra = round2(totalExtra + actualExtra)
      extraPrincipal = round2(extraPrincipal + principalPaid)
      if (strategy === 'payment' && balance > 0) {
        const futureDates = dates.filter((future) => future > date)
        currentPayment = solvePayment(balance, accrued, terms.annualRate, date, futureDates)
      }
      rows.push({ id: `${iso}-extra`, date: iso, type: 'prepayment', regularPayment: 0, extraPayment: actualExtra, totalPayment: actualExtra, interest: interestPaid, regularPrincipal: 0, extraPrincipal: principalPaid, balance, paymentAfter: balance > 0 ? currentPayment : 0, remainingMonths: 0, strategy })
    }
    previousDate = date
  }

  if (balance > 0.005 || accrued > 0.005) {
    const finalDate = dates.at(-1) ?? previousDate
    if (finalDate > previousDate) accrued = round2(accrued + interestFor(balance, terms.annualRate, previousDate, finalDate))
    const finalPayment = round2(balance + accrued)
    totalInterest = round2(totalInterest + accrued)
    regularPrincipal = round2(regularPrincipal + balance)
    rows.push({ id: `${toIso(finalDate)}-closing`, date: toIso(finalDate), type: 'regular', regularPayment: finalPayment, extraPayment: 0, totalPayment: finalPayment, interest: accrued, regularPrincipal: balance, extraPrincipal: 0, balance: 0, paymentAfter: 0, remainingMonths: 0 })
    balance = 0
    accrued = 0
  }

  const payoffDate = rows.length ? parseIso(rows.at(-1)!.date) : issueDate
  for (const row of rows) row.remainingMonths = durationMonths(parseIso(row.date), payoffDate)

  const monthlyTotals = new Map<string, number>()
  for (const row of rows) {
    const month = row.date.slice(0, 7)
    monthlyTotals.set(month, round2((monthlyTotals.get(month) ?? 0) + row.totalPayment))
  }
  const totalPaid = round2(rows.reduce((sum, row) => sum + row.totalPayment, 0))
  return {
    principal,
    monthlyPayment: originalPayment,
    currentPayment,
    totalInterest,
    totalPaid,
    totalExtra,
    regularPrincipal,
    extraPrincipal,
    payoffDate,
    durationMonths: durationMonths(issueDate, payoffDate),
    maxMonthlyPayment: Math.max(0, ...monthlyTotals.values()),
    schedule: rows,
    conflicts,
  }
}

export function calculateBaseline(input: { principal: number; annualRate: number; years: number; issueDate: string; firstPaymentDate: string }): ScenarioResult {
  return calculateScenario({ propertyPrice: input.principal, downPayment: 0, annualRate: input.annualRate, years: input.years, issueDate: input.issueDate, firstPaymentDate: input.firstPaymentDate })
}

export function formatDuration(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (!rest) return `${years} ${plural(years, 'год', 'года', 'лет')}`
  return `${years} ${plural(years, 'год', 'года', 'лет')} ${rest} ${plural(rest, 'месяц', 'месяца', 'месяцев')}`
}

function plural(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10
  const mod100 = value % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
