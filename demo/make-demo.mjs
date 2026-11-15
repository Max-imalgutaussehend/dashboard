// Writes demo/state.json with dates relative to today (local preview only: DASHBOARD_DEV=1 DASHBOARD_DATA=demo/data node server.mjs)
import { writeFileSync, mkdirSync } from 'node:fs';
const day = (o) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);
const state = {
  title: 'Guten Morgen, Max', subtitle: '',
  briefing: 'Heute zwei Vorlesungen, die Abgabe für Software Engineering ist morgen 12 Uhr. Dein Sparziel liegt im Plan, beim Essen bist du über Budget. Signal-Rückfrage zur Miete ist noch offen.',
  widgets: [
    { id: 'urgent', type: 'callout', tone: 'warn', text: 'Abgabe Software Engineering morgen 12:00. Noch 3 von 8 Aufgaben offen.' },
    { id: 'net', type: 'stat', section: 'Heute', title: 'Vermögen', value: 8420, unit: '€', delta: { value: 215, label: 'seit letztem Monat', good_when: 'up' }, spark: [7600, 7700, 7650, 7900, 8100, 8205, 8420] },
    { id: 'sleep', type: 'stat', section: 'Heute', title: 'Schlaf', value: 7.2, unit: 'h', delta: { value: -0.4, label: 'zu gestern', good_when: 'up' }, spark: [6.5, 7.8, 7.0, 6.9, 7.6, 7.6, 7.2] },
    { id: 'steps', type: 'stat', section: 'Heute', title: 'Schritte', value: '9.340', delta: { value: 12, label: '% über Ziel', good_when: 'up' } },
    { id: 'todo', type: 'todo', section: 'Heute', title: 'Aufgaben', span: 2, items: [
      { id: 't1', text: 'Abgabe Software Engineering hochladen', due: day(1), priority: 'high' },
      { id: 't2', text: 'Mietvertrag unterschreiben und zurückschicken', due: day(-1), priority: 'high' },
      { id: 't3', text: 'Skript Verteilte Systeme Kapitel 6 lesen', due: day(3) },
      { id: 't4', text: 'Zahnarzttermin vereinbaren', tag: 'Gesundheit' },
      { id: 't5', text: 'Paket zur Post bringen', done: true, due: day(0) } ] },
    { id: 'rem', type: 'reminders', section: 'Heute', title: 'Erinnerungen', span: 2, items: [
      { id: 'r1', text: 'Tabletten nehmen', at: day(0) + 'T20:00' }, { id: 'r2', text: 'Mama anrufen', at: day(1) + 'T18:30' }, { id: 'r3', text: 'Semesterbeitrag überweisen', at: day(4) } ] },
    { id: 'agenda', type: 'agenda', section: 'Heute', title: 'Termine', span: 2, events: [
      { at: day(0) + 'T10:15', title: 'Verteilte Systeme', place: 'Hörsaal 2' }, { at: day(0) + 'T14:00', title: 'Software Engineering Übung', place: 'Raum 114' }, { at: day(2) + 'T09:00', title: 'Hackathon Vorbereitung', place: 'Discord' } ] },
    { id: 'run', type: 'tracker', section: 'Gewohnheiten', title: 'Laufen', unit: 'km', target: 5, entries: Array.from({ length: 26 }, (_, i) => ({ date: day(-i), value: [5, 6, 0, 3, 5.5, 0, 4, 5, 7, 0][i % 10] })) },
    { id: 'read', type: 'tracker', section: 'Gewohnheiten', title: 'Lesen', unit: 'Seiten', target: 20, entries: Array.from({ length: 12 }, (_, i) => ({ date: day(-i), value: [22, 25, 10, 30, 0, 20][i % 6] })) },
    { id: 'wt', type: 'chart', section: 'Gewohnheiten', title: 'Gewicht', kind: 'line', unit: 'kg', span: 4, series: [{ label: 'Gewicht', points: Array.from({ length: 14 }, (_, i) => ({ x: day(i - 13).slice(5), y: +(79.2 - i * 0.07 + Math.sin(i) * 0.25).toFixed(1) })) }, { label: 'Ziel', points: Array.from({ length: 14 }, (_, i) => ({ x: day(i - 13).slice(5), y: 78 })) }] },
    { id: 'budget', type: 'budget', section: 'Finanzen', title: 'Budget November', period: 'November', span: 2, categories: [
      { name: 'Miete', spent: 520, limit: 520 }, { name: 'Essen', spent: 312, limit: 260 }, { name: 'Freizeit', spent: 74, limit: 120 }, { name: 'Transport', spent: 49, limit: 50 }, { name: 'Abos', spent: 31 } ] },
    { id: 'acc', type: 'accounts', section: 'Finanzen', title: 'Konten', span: 2, items: [
      { name: 'Girokonto', balance: 1240.5, change: -312 }, { name: 'Tagesgeld', balance: 4800, change: 150 }, { name: 'ETF-Depot', balance: 2379.5, change: 377 } ] },
    { id: 'spend', type: 'chart', section: 'Finanzen', title: 'Ausgaben pro Woche', kind: 'bar', unit: '€', span: 2, series: [{ label: 'Ausgaben', points: [{ x: 'KW 42', y: 142 }, { x: 'KW 43', y: 188 }, { x: 'KW 44', y: 96 }, { x: 'KW 45', y: 171 }] }] },
    { id: 'goals', type: 'progress', section: 'Finanzen', title: 'Sparziel Laptop', span: 2, items: [{ label: 'Laptop', value: 1480, target: 2000, unit: '€' }, { label: 'Notgroschen', value: 3, target: 6, unit: 'Monate' }] },
  ],
};
mkdirSync('demo/data', { recursive: true });
writeFileSync('demo/data/dashboard.json', JSON.stringify(state));
