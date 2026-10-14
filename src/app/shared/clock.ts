import { Injectable } from '@angular/core';

/** The time the ports read (the day of the cash): the demo build may set its own; no view reads Date.now(). */
@Injectable({ providedIn: 'root', useFactory: () => new SystemClock() })
export abstract class Clock { abstract now(): number; }

class SystemClock extends Clock { override now(): number { return Date.now(); } }
