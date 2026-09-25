import { describe, it, expect } from 'vitest';
import { computeTripKinematics, type TripData } from '@core/sim/kinematics';
import type { Shape } from '@core/sim/shapes_loader';

/**
 * Creates a synthetic linear or curved Shape with regular 10m steps.
 */
function createSyntheticShape(lengthM: number, numPoints: number = 100): Shape {
  const coords = new Float32Array((numPoints + 1) * 2);
  const dist = new Float32Array(numPoints + 1);
  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    const distM = fraction * lengthM;
    dist[i] = distM;
    const lon = -0.12 + fraction * 0.05;
    const lat = 51.50 + Math.sin(fraction * Math.PI) * 0.02;
    coords[i * 2] = lon;
    coords[i * 2 + 1] = lat;
  }
  return {
    id: 'shape_synth',
    length: lengthM,
    coords,
    dist
  };
}

describe('London Vicious Cases — Simulation Kinematics & Topology', () => {

  describe('Case 1: Circle Line Spiral Topology (Double Edgware Road visit)', () => {
    it('handles an open spiral journey visiting Edgware Road twice without modulo or loop jump', () => {
      // Circle line from Hammersmith (0m) to Edgware Road pass 1 (4500m) around loop to Edgware Road pass 2 (24000m)
      const shape = createSyntheticShape(25000, 250);

      const circleTrip: TripData = {
        id: 'circle_trip_spiral_01',
        line: 'circle',
        dir: 1, // outbound
        shapeId: shape.id,
        t0: 28800, // 08:00:00
        t1: 32400, // 09:00:00
        destName: 'Edgware Road (Circle Line)',
        stops: [
          [28800, 28830, 0, 'Hammersmith (H&C Line)'],
          [29400, 29430, 4500, 'Edgware Road (Circle Line) [Pass 1]'],
          [29700, 29730, 7500, 'Baker Street'],
          [30300, 30330, 13000, 'King\'s Cross St. Pancras'],
          [30900, 30930, 18000, 'Embankment'],
          [31500, 31530, 21000, 'Victoria'],
          [32100, 32130, 23000, 'Paddington'],
          [32400, 32430, 24000, 'Edgware Road (Circle Line) [Terminus]']
        ]
      };

      // 1. Train at Hammersmith departure
      const tDepHammersmith = computeTripKinematics(circleTrip, shape, 28815, 0, '#FFD300', '#000000', 'Circle', 0);
      expect(tDepHammersmith).not.toBeNull();
      expect(tDepHammersmith?.currentDistM).toBe(0);
      expect(tDepHammersmith?.spd).toBe(0);
      expect(tDepHammersmith?.next).toBe('Edgware Road (Circle Line) [Pass 1]');

      // 2. Train dwelling at first pass of Edgware Road (4500m)
      const tAtEdgwarePass1 = computeTripKinematics(circleTrip, shape, 29415, 0, '#FFD300', '#000000', 'Circle', 0);
      expect(tAtEdgwarePass1).not.toBeNull();
      expect(tAtEdgwarePass1?.currentDistM).toBe(4500);
      expect(tAtEdgwarePass1?.spd).toBe(0);
      expect(tAtEdgwarePass1?.next).toBe('Baker Street');

      // 3. Train in the middle of the loop around King's Cross (13000m)
      const tAtKingsCross = computeTripKinematics(circleTrip, shape, 30315, 0, '#FFD300', '#000000', 'Circle', 0);
      expect(tAtKingsCross).not.toBeNull();
      expect(tAtKingsCross?.currentDistM).toBe(13000);
      expect(tAtKingsCross?.spd).toBe(0);
      expect(tAtKingsCross?.next).toBe('Embankment');

      // 4. Train cruising between Victoria and Paddington (22000m)
      const tCruisingToPaddington = computeTripKinematics(circleTrip, shape, 31800, 0, '#FFD300', '#000000', 'Circle', 0);
      expect(tCruisingToPaddington).not.toBeNull();
      expect(tCruisingToPaddington!.currentDistM).toBeGreaterThan(21000);
      expect(tCruisingToPaddington!.currentDistM).toBeLessThan(23000);
      expect(tCruisingToPaddington!.spd).toBeGreaterThan(0);
      expect(tCruisingToPaddington?.next).toBe('Paddington');

      // 5. Train arriving at final terminus Edgware Road (24000m)
      const tAtEdgwareTerminus = computeTripKinematics(circleTrip, shape, 32415, 0, '#FFD300', '#000000', 'Circle', 0);
      expect(tAtEdgwareTerminus).not.toBeNull();
      expect(tAtEdgwareTerminus?.currentDistM).toBe(24000);
      expect(tAtEdgwareTerminus?.spd).toBe(0);
      expect(tAtEdgwareTerminus?.next).toBe('Edgware Road (Circle Line) [Terminus]');

      // Crucial assertion: no modulo wrap-around back to 4500m
      expect(tAtEdgwareTerminus!.currentDistM).toBe(24000);
    });
  });

  describe('Case 2: Metropolitan Line Skip-Stop (Fast/Semi-Fast Pattern)', () => {
    it('maintains continuous track position while cruising through skipped stations at full speed', () => {
      // Metropolitan Fast train from Baker Street to Amersham, skipping Wembley Park, Preston Road, Northwick Park
      // Track distances: Baker Street (0m), Finchley Road (4000m), Wembley Park (8500m), Preston Rd (10200m), Northwick Pk (11800m), Harrow-on-the-Hill (14000m)
      const shape = createSyntheticShape(16000, 160);

      const fastTrip: TripData = {
        id: 'met_fast_amersham_01',
        line: 'metropolitan',
        dir: 0, // inbound
        shapeId: shape.id,
        t0: 30600, // 08:30:00
        t1: 31800, // 08:50:00
        destName: 'Amersham',
        stops: [
          [30600, 30630, 0, 'Baker Street'],
          [30900, 30930, 4000, 'Finchley Road'],
          // Skips Wembley Park (8500m), Preston Road (10200m), Northwick Park (11800m)
          [31500, 31530, 14000, 'Harrow-on-the-Hill']
        ]
      };

      // 1. Train departing Finchley Road at t = 30930 (4000m)
      const tDepFinchley = computeTripKinematics(fastTrip, shape, 30930, 0, '#9B0056', '#FFFFFF', 'Metropolitan', 0);
      expect(tDepFinchley).not.toBeNull();
      expect(tDepFinchley?.currentDistM).toBe(4000);
      expect(tDepFinchley?.next).toBe('Harrow-on-the-Hill');

      // 2. Train passing the location of skipped station Wembley Park (dist ~ 8500m)
      // Interpolated time between Finchley Road departure (30930s) and Harrow arrival (31500s) = 570s for 10000m
      // At t = 31200s (270s after Finchley dep), progress is ~47%, distance ~ 8700m
      const tPassingWembley = computeTripKinematics(fastTrip, shape, 31200, 0, '#9B0056', '#FFFFFF', 'Metropolitan', 0);
      expect(tPassingWembley).not.toBeNull();
      expect(tPassingWembley!.currentDistM).toBeGreaterThan(8000);
      expect(tPassingWembley!.currentDistM).toBeLessThan(9500);

      // Must be at cruise speed, NOT stopping or dwelling
      expect(tPassingWembley!.spd).toBeGreaterThan(50);
      expect(tPassingWembley!.speedMps).toBeGreaterThan(15);
      // Next scheduled station remains Harrow-on-the-Hill
      expect(tPassingWembley?.next).toBe('Harrow-on-the-Hill');

      // 3. Train stops normally at Harrow-on-the-Hill
      const tAtHarrow = computeTripKinematics(fastTrip, shape, 31515, 0, '#9B0056', '#FFFFFF', 'Metropolitan', 0);
      expect(tAtHarrow).not.toBeNull();
      expect(tAtHarrow?.currentDistM).toBe(14000);
      expect(tAtHarrow?.spd).toBe(0);
    });
  });

  describe('Case 3: Northern Line Multiple Branches (Bank vs Charing Cross branches)', () => {
    it('correctly segregates trains onto separate branch geometries without cross-teleportation', () => {
      // Shape A: Charing Cross branch (via Camden -> Euston Charing Cross -> Tottenham Court Road -> Charing Cross -> Kennington)
      const shapeCharingCross = createSyntheticShape(12000, 120);
      shapeCharingCross.id = 'northern_shape_cx';

      // Shape B: Bank branch (via Camden -> Euston Bank -> King's Cross -> Moorgate -> Bank -> London Bridge -> Kennington)
      const shapeBank = createSyntheticShape(13500, 135);
      shapeBank.id = 'northern_shape_bank';

      const tripCharingCross: TripData = {
        id: 'northern_cx_01',
        line: 'northern',
        dir: 0,
        shapeId: shapeCharingCross.id,
        t0: 30600,
        t1: 31500,
        destName: 'Battersea Power Station',
        stops: [
          [30600, 30620, 0, 'Camden Town'],
          [30800, 30820, 2800, 'Tottenham Court Road'],
          [31000, 31020, 4900, 'Charing Cross'],
          [31200, 31220, 7500, 'Waterloo'],
          [31500, 31520, 11000, 'Kennington']
        ]
      };

      const tripBank: TripData = {
        id: 'northern_bank_01',
        line: 'northern',
        dir: 0,
        shapeId: shapeBank.id,
        t0: 30600,
        t1: 31600,
        destName: 'Morden',
        stops: [
          [30600, 30620, 0, 'Camden Town'],
          [30850, 30870, 3500, 'King\'s Cross St. Pancras'],
          [31100, 31120, 6800, 'Moorgate'],
          [31300, 31320, 8900, 'Bank'],
          [31600, 31620, 12500, 'Kennington']
        ]
      };

      const timeSec = 31110; // At ~08:38:30

      // Train on Charing Cross branch
      const tCX = computeTripKinematics(tripCharingCross, shapeCharingCross, timeSec, 0, '#000000', '#FFFFFF', 'Northern', 0);
      expect(tCX).not.toBeNull();
      expect(tCX?.shapeId).toBe('northern_shape_cx');
      expect(tCX?.next).toBe('Waterloo');
      expect(tCX!.currentDistM).toBeGreaterThan(4900);
      expect(tCX!.currentDistM).toBeLessThan(7500);

      // Train on Bank branch
      const tBank = computeTripKinematics(tripBank, shapeBank, timeSec, 0, '#000000', '#FFFFFF', 'Northern', 0);
      expect(tBank).not.toBeNull();
      expect(tBank?.shapeId).toBe('northern_shape_bank');
      expect(tBank?.next).toBe('Bank');
      expect(tBank?.currentDistM).toBe(6800); // Dwelling at Moorgate (dist = 6800m), next station is Bank
      expect(tBank?.spd).toBe(0);

      // Distinct positions and shapes confirmed
      expect(tCX?.shapeId).not.toBe(tBank?.shapeId);
      expect(tCX?.pos[0]).not.toBe(tBank?.pos[0]);
    });
  });

  describe('Case 4: Elizabeth Line High-Speed Mainline & Branch Split (Abbey Wood vs Shenfield branches)', () => {
    it('handles high-speed mainline surface running and segregates eastern branches without collision', () => {
      // Branch 1: Abbey Wood spur (Stepney Green -> Canary Wharf -> Custom House -> Woolwich -> Abbey Wood)
      const shapeAbbeyWood = createSyntheticShape(18000, 180);
      shapeAbbeyWood.id = 'elizabeth_shape_abw';

      // Branch 2: Shenfield GEML (Stepney Green -> Stratford -> Ilford -> Romford -> Shenfield)
      const shapeShenfield = createSyntheticShape(32000, 320);
      shapeShenfield.id = 'elizabeth_shape_snf';

      const tripAbbeyWood: TripData = {
        id: 'elizabeth_abw_01',
        line: 'elizabeth',
        dir: 0,
        shapeId: shapeAbbeyWood.id,
        t0: 30600,
        t1: 32000,
        destName: 'Abbey Wood',
        stops: [
          [30600, 30630, 0, 'Paddington'],
          [31000, 31030, 6000, 'Whitechapel'],
          [31300, 31330, 11000, 'Canary Wharf'],
          [31700, 31730, 15000, 'Woolwich'],
          [32000, 32030, 18000, 'Abbey Wood']
        ]
      };

      const tripShenfield: TripData = {
        id: 'elizabeth_snf_01',
        line: 'elizabeth',
        dir: 0,
        shapeId: shapeShenfield.id,
        t0: 30600,
        t1: 32200,
        destName: 'Shenfield',
        stops: [
          [30600, 30630, 0, 'Paddington'],
          [31000, 31030, 6000, 'Whitechapel'],
          [31400, 31430, 12000, 'Stratford'],
          [31800, 31830, 20000, 'Romford'],
          [32200, 32230, 32000, 'Shenfield']
        ]
      };

      // 1. Prior to bifurcation at Stepney Green (trains near Whitechapel, dist ~ 6000m)
      const tWhitechapel = computeTripKinematics(tripAbbeyWood, shapeAbbeyWood, 31015, 0, '#6950A1', '#FFFFFF', 'Elizabeth', -15);
      expect(tWhitechapel).not.toBeNull();
      expect(tWhitechapel?.currentDistM).toBe(6000);
      expect(tWhitechapel?.spd).toBe(0);
      expect(tWhitechapel?.next).toBe('Canary Wharf');

      // 2. Post bifurcation at t = 31600: Abbey Wood train cruising to Woolwich, Shenfield train cruising to Romford
      const tPostForkAbw = computeTripKinematics(tripAbbeyWood, shapeAbbeyWood, 31500, 0, '#6950A1', '#FFFFFF', 'Elizabeth', -15);
      const tPostForkSnf = computeTripKinematics(tripShenfield, shapeShenfield, 31600, 0, '#6950A1', '#FFFFFF', 'Elizabeth', -15);

      expect(tPostForkAbw).not.toBeNull();
      expect(tPostForkSnf).not.toBeNull();
      expect(tPostForkAbw?.next).toBe('Woolwich');
      expect(tPostForkSnf?.next).toBe('Romford');
      expect(tPostForkAbw!.currentDistM).toBeGreaterThan(11000);
      expect(tPostForkSnf!.currentDistM).toBeGreaterThan(12000);

      // Verify shape segregation and high-speed mainline running
      expect(tPostForkAbw?.shapeId).toBe('elizabeth_shape_abw');
      expect(tPostForkSnf?.shapeId).toBe('elizabeth_shape_snf');
      expect(tPostForkSnf!.spd).toBeGreaterThan(60); // Surface mainline cruising speed
    });
  });

  describe('Case 5: London Overground Orbital Interline & Bi-Level Infrastructure (Lioness vs Mildmay at Willesden Junction)', () => {
    it('maintains clean segregation between Watford DC low-level and North London Line high-level orbital viaduct', () => {
      // 1. Lioness line on Watford DC lines (Low-level at Willesden Junction, dist = 8500m)
      const shapeLioness = createSyntheticShape(28000, 280);
      shapeLioness.id = 'lioness_0_373';

      // 2. Mildmay line on North London orbital viaduct (High-level at Willesden Junction, dist = 7200m)
      const shapeMildmay = createSyntheticShape(28000, 280);
      shapeMildmay.id = 'mildmay_0_375';

      const tripLioness: TripData = {
        id: 'LO_LIO_0_510',
        line: 'lioness',
        dir: 0,
        shapeId: shapeLioness.id,
        t0: 30600,
        t1: 33600,
        destName: 'Watford Junction',
        stops: [
          [30600, 30630, 0, 'London Euston'],
          [30900, 30930, 4000, 'Queen\'s Park'],
          [31200, 31230, 8500, 'Willesden Junction (Low Level)'],
          [31600, 31630, 14000, 'Harrow & Wealdstone'],
          [32400, 32430, 24000, 'Bushey'],
          [33000, 33030, 28000, 'Watford Junction']
        ]
      };

      const tripMildmay: TripData = {
        id: 'LO_MIL_RS_0_510',
        line: 'mildmay',
        dir: 0,
        shapeId: shapeMildmay.id,
        t0: 30600,
        t1: 33600,
        destName: 'Stratford',
        stops: [
          [30600, 30630, 0, 'Richmond'],
          [30900, 30930, 3500, 'Gunnersbury'],
          [31200, 31230, 7200, 'Willesden Junction (High Level)'],
          [31600, 31630, 11500, 'West Hampstead'],
          [32200, 32230, 18000, 'Highbury & Islington'],
          [33000, 33030, 28000, 'Stratford']
        ]
      };

      const timeSec = 31215; // 08:40:15 (both trains dwelling at Willesden Junction simultaneously)

      const tLioness = computeTripKinematics(tripLioness, shapeLioness, timeSec, 0, '#EF9600', '#FFFFFF', 'Lioness', 2.0);
      const tMildmay = computeTripKinematics(tripMildmay, shapeMildmay, timeSec, 0, '#2774AE', '#FFFFFF', 'Mildmay', 2.0);

      expect(tLioness).not.toBeNull();
      expect(tMildmay).not.toBeNull();

      // Check correct stopping at their respective levels
      expect(tLioness?.currentDistM).toBe(8500);
      expect(tLioness?.spd).toBe(0);
      expect(tLioness?.next).toBe('Harrow & Wealdstone');
      expect(tLioness?.shapeId).toBe('lioness_0_373');

      expect(tMildmay?.currentDistM).toBe(7200);
      expect(tMildmay?.spd).toBe(0);
      expect(tMildmay?.next).toBe('West Hampstead');
      expect(tMildmay?.shapeId).toBe('mildmay_0_375');

      // Crucial verification: completely independent routes, destinations, and shape tracking
      expect(tLioness?.dest).toBe('Watford Junction');
      expect(tMildmay?.dest).toBe('Stratford');
      expect(tLioness?.line).toBe('lioness');
      expect(tMildmay?.line).toBe('mildmay');
    });
  });

});

