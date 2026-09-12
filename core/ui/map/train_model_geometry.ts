export function compassBearingToDeckYaw(compassBearingDegrees: number): number {
  return 90 - compassBearingDegrees;
}

export function carCenterSpacingM(carLengthM: number, interCarGapM: number): number {
  return carLengthM + interCarGapM;
}