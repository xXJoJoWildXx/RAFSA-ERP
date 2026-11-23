/**
 * Tema oscuro del calendario (react-day-picker v9 sobre el Calendar de shadcn).
 *
 * El componente base viene pintado con los tokens de shadcn —`bg-background`,
 * `bg-accent`, `bg-primary`— que en esta app siguen siendo los claros de
 * fábrica: tal cual, el calendario sale como un recuadro blanco encima del
 * panel oscuro. Aquí se traduce a la paleta de la plataforma: fondo
 * transparente, texto slate y el azul de marca #0174bd para la selección.
 *
 * Vive aparte para que todos los calendarios de la app se vean igual: quien
 * agregue uno nuevo importa estas dos constantes y no vuelve a inventar el
 * estilo.
 *
 *   <Calendar
 *     mode="range"
 *     className={`[--cell-size:2.25rem] ${CALENDAR_DARK_CLASS}`}
 *     classNames={CALENDAR_DARK_CLASSNAMES}
 *   />
 *
 * El tamaño de la celda se deja fuera a propósito: un calendario dentro de un
 * popover chico y otro dentro de un modal ancho no se ven bien con la misma
 * medida.
 */

import type { ClassNames } from "react-day-picker"

/**
 * Va en `className`. Pinta el botón de cada día, que el Calendar arma con el
 * <Button> de shadcn: sus clases traen `bg-primary` y `bg-accent` con alta
 * especificidad, así que la única forma limpia de ganarles es con `!`.
 */
export const CALENDAR_DARK_CLASS = [
  // El contenedor no debe pintar nada: el fondo lo pone el panel que lo aloja
  "!bg-transparent",
  // Días
  "[&_[data-day]]:text-slate-200 [&_[data-day]]:font-normal",
  "[&_[data-day]:hover]:!bg-slate-700 [&_[data-day]:hover]:!text-white",
  "[&_[data-day]:focus-visible]:!ring-2 [&_[data-day]:focus-visible]:!ring-[#0174bd]/60",
  // Selección
  "[&_[data-selected-single=true]]:!bg-[#0174bd] [&_[data-selected-single=true]]:!text-white",
  "[&_[data-range-start=true]]:!bg-[#0174bd] [&_[data-range-start=true]]:!text-white",
  "[&_[data-range-end=true]]:!bg-[#0174bd] [&_[data-range-end=true]]:!text-white",
  "[&_[data-range-middle=true]]:!bg-transparent [&_[data-range-middle=true]]:!text-slate-100",
].join(" ")

/** Va en `classNames`. Reemplaza clase por clase las del componente base. */
export const CALENDAR_DARK_CLASSNAMES: Partial<ClassNames> = {
  root: "w-fit",
  months: "flex gap-6 flex-col md:flex-row relative",
  month: "flex flex-col w-full gap-3",

  // Navegación
  nav: "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
  button_previous:
    "size-8 p-0 rounded-md text-slate-400 transition-colors cursor-pointer " +
    "hover:bg-slate-700 hover:text-white aria-disabled:opacity-30 aria-disabled:hover:bg-transparent select-none",
  button_next:
    "size-8 p-0 rounded-md text-slate-400 transition-colors cursor-pointer " +
    "hover:bg-slate-700 hover:text-white aria-disabled:opacity-30 aria-disabled:hover:bg-transparent select-none",
  month_caption: "flex items-center justify-center h-8 w-full px-8",
  caption_label: "text-slate-100 text-sm font-semibold select-none capitalize",

  // Cuadrícula. En la v9 la tabla se llama month_grid: el Calendar de shadcn
  // todavía manda `table`, que ya no existe y el componente ignora.
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "text-slate-500 flex-1 font-medium text-[0.72rem] uppercase tracking-wide select-none",
  week: "flex w-full mt-1",
  day:
    "relative w-full h-full p-0 text-center group/day aspect-square select-none " +
    "[&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",

  // El rango se pinta en la CELDA, no en el botón: así la banda azul es
  // continua y no se corta en los espacios entre días.
  range_start: "rounded-l-md bg-[#0174bd]/20",
  range_middle: "rounded-none bg-[#0174bd]/20",
  range_end: "rounded-r-md bg-[#0174bd]/20",

  today:
    "rounded-md ring-1 ring-inset ring-[#0174bd]/70 text-[#4da8e8] font-semibold " +
    "data-[selected=true]:ring-0 data-[selected=true]:text-inherit",
  outside: "text-slate-600 aria-selected:text-slate-500",
  disabled: "text-slate-700 opacity-40",
  hidden: "invisible",
}
