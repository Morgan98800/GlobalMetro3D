import sqlite3
import zipfile
import csv
import io
import json
import os

def build_ladders(gtfs_zip_path='data/raw/IDFM-gtfs.zip', processed_dir='data/processed', out_path='web/public/data/line_ladders.json'):
    with zipfile.ZipFile(gtfs_zip_path) as z:
        with z.open('stops.txt') as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding='utf-8'))
            stop_name_map = {row['stop_id']: row['stop_name'] for row in reader}

    lines_meta = json.load(open(os.path.join(processed_dir, 'lines.json')))
    stations_meta = json.load(open(os.path.join(processed_dir, 'stations.json')))
    line_map = {l['id']: l for l in lines_meta}

    name_to_station = {}
    for s in stations_meta:
        name_to_station[s['name'].lower()] = s

    conn = sqlite3.connect(os.path.join(processed_dir, 'network.sqlite'))
    c = conn.cursor()

    ladders = {}

    for line in lines_meta:
        lid = line['id']
        short = line['short_name']
        ladders[lid] = {
            'id': lid,
            'short_name': short,
            'color': line['color'],
            'text_color': line['text_color'],
            'directions': {}
        }
        
        for did in [0, 1]:
            c.execute('''
                SELECT DISTINCT t.shape_id, t.trip_id, COUNT(ts.stop_sequence) as cnt
                FROM trips_index t
                JOIN trip_stops ts ON t.trip_id = ts.trip_id
                WHERE t.route_id = ? AND t.direction_id = ?
                GROUP BY t.shape_id
                ORDER BY cnt DESC
            ''', (lid, did))
            shapes_info = c.fetchall()
            if not shapes_info:
                continue
                
            all_shape_stations = []
            for sid, tid, cnt in shapes_info:
                c.execute('''
                    SELECT ts.stop_id, ts.shape_dist_traveled
                    FROM trip_stops ts
                    WHERE ts.trip_id = ?
                    ORDER BY ts.stop_sequence
                ''', (tid,))
                rows = c.fetchall()
                st_list = []
                for spid, dist in rows:
                    sname = stop_name_map.get(spid, spid)
                    st_meta = name_to_station.get(sname.lower())
                    coords = st_meta['coordinates'] if st_meta else [2.35, 48.85]
                    transfers = []
                    is_hub = False
                    if st_meta:
                        is_hub = st_meta.get('is_hub', False)
                        for other_lid in st_meta.get('lines', []):
                            if other_lid != lid and other_lid in line_map:
                                ol = line_map[other_lid]
                                transfers.append({
                                    'id': ol['id'],
                                    'short_name': ol['short_name'],
                                    'color': ol['color'],
                                    'text_color': ol['text_color']
                                })
                    st_list.append({
                        'id': spid,
                        'name': sname,
                        'distance_m': round(dist, 1),
                        'coordinates': coords,
                        'is_hub': is_hub,
                        'transfers': transfers
                    })
                all_shape_stations.append((sid, st_list))
                
            primary_shape_id, primary_stations = all_shape_stations[0]
            terminus = primary_stations[-1]['name']
            origin = primary_stations[0]['name']
            
            secondary_branches = []
            if len(all_shape_stations) > 1:
                seen_termini = {terminus}
                for sid, st_list in all_shape_stations[1:]:
                    term = st_list[-1]['name']
                    if term not in seen_termini and len(st_list) > 5:
                        seen_termini.add(term)
                        secondary_branches.append({
                            'terminus': term,
                            'stations': st_list
                        })
            
            ladders[lid]['directions'][str(did)] = {
                'terminus': terminus,
                'origin': origin,
                'stations': primary_stations,
                'branches': secondary_branches
            }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(ladders, f, ensure_ascii=False, indent=2)

    print(f'[ladder] Generated line ladders to {out_path} ({os.path.getsize(out_path)/1024:.1f} KB)')

if __name__ == '__main__':
    build_ladders()
