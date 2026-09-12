/**
 * paris_time.ts — résolution de l'heure de service GTFS basée sur Luxon.
 *
 * BUG CORRIGÉ : browser_engine.ts faisait `currentSec = sec % 86400`. Dans le GTFS,
 * les courses qui continuent après minuit portent des heures >= 86400 (24h30 = 88200).
 * À 00h30, currentSec valait 1800 et aucune course n'était sélectionnée : 0 rame.
 *
 * Principe : un instant donné appartient à DEUX journées de service possibles.
 * À 00h30 le mardi, on est à la fois à 1800 s de la journée de mardi et à 88200 s
 * de la journée de lundi. Il faut évaluer les deux.
 *
 * Luxon est employé sans exception avec un fuseau explicite issu de CityConfig.
 */

import { DateTime } from 'luxon';

export interface CityClock {
  /** Date civile dans le fuseau, 'YYYY-MM-DD' */
  date: string;
  /** Secondes depuis minuit civil, 0..86399 */
  secondsSinceMidnight: number;
}

export type ParisClock = CityClock;

/** Heure civile dans le fuseau spécifié, changements d'heure inclus via Luxon. */
export function cityClock(now: Date = new Date(), timezone: string = 'Europe/Paris'): CityClock {
  const dt = DateTime.fromJSDate(now).setZone(timezone);
  const hour = dt.hour % 24;
  const minute = dt.minute;
  const second = dt.second;

  return {
    date: dt.toISODate() || '',
    secondsSinceMidnight: hour * 3600 + minute * 60 + second,
  };
}

/** Heure civile à Paris (conservé pour rétrocompatibilité des appelants existants). */
export function parisClock(now: Date = new Date()): ParisClock {
  return cityClock(now, 'Europe/Paris');
}

export interface ServiceCandidate {
  /** Date de la journée de service à laquelle rattacher la course */
  serviceDate: string;
  /** Secondes depuis le minuit de cette journée de service, peut dépasser 86400 */
  seconds: number;
}

function shiftDate(isoDate: string, days: number, timezone: string): string {
  const dt = DateTime.fromISO(isoDate, { zone: timezone }).plus({ days });
  return dt.toISODate() || isoDate;
}

/**
 * Les deux journées de service candidates pour l'instant courant.
 * La seconde n'est retournée que si elle peut encore contenir des courses,
 * soit avant 05h00 civiles (le service de nuit ne va jamais au-delà de ~29h).
 */
export function serviceCandidates(
  now: Date = new Date(),
  timezone: string = 'Europe/Paris'
): ServiceCandidate[] {
  const { date, secondsSinceMidnight } = cityClock(now, timezone);
  const candidates: ServiceCandidate[] = [
    { serviceDate: date, seconds: secondsSinceMidnight },
  ];
  if (secondsSinceMidnight < 5 * 3600) {
    candidates.push({
      serviceDate: shiftDate(date, -1, timezone),
      seconds: secondsSinceMidnight + 86400,
    });
  }
  return candidates;
}

export interface TripWindow {
  /** heure de départ du premier arrêt, en secondes depuis minuit de service */
  t0: number;
  /** heure d'arrivée du dernier arrêt */
  t1: number;
  /** identifiant de service, si l'artefact le porte */
  service_id?: string;
}

export interface ActiveTrip<T extends TripWindow> {
  trip: T;
  /** Le temps de service à utiliser pour la cinématique de CETTE course. */
  serviceSeconds: number;
  serviceDate: string;
}

/**
 * Sélection des courses actives, tolérante au passage de minuit.
 *
 * `runsOn` est optionnel : si `schedule.json` ne porte pas de calendrier, passer
 * `undefined` et toutes les courses seront considérées valides les deux jours.
 * Dans ce cas, une course de nuit apparaîtra correctement, mais une course diurne
 * ne sera jamais faussement activée puisque son t1 est bien en dessous de 86400.
 */
export function selectActiveTrips<T extends TripWindow>(
  trips: readonly T[],
  now: Date = new Date(),
  runsOn?: (trip: T, serviceDate: string) => boolean,
  marginSeconds = 0,
  timezone: string = 'Europe/Paris'
): ActiveTrip<T>[] {
  const candidates = serviceCandidates(now, timezone);
  const active: ActiveTrip<T>[] = [];

  for (const trip of trips) {
    for (const { serviceDate, seconds } of candidates) {
      if (seconds < trip.t0 - marginSeconds) continue;
      if (seconds > trip.t1 + marginSeconds) continue;
      if (runsOn && !runsOn(trip, serviceDate)) continue;
      active.push({ trip, serviceSeconds: seconds, serviceDate });
      break;
    }
  }

  return active;
}
