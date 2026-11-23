import SwiftUI

public struct AboutOpenDataView: View {
    @Bindable var vm: ParisSubwayViewModel
    @Environment(\.dismiss) private var dismiss

    public init(vm: ParisSubwayViewModel) {
        self.vm = vm
    }

    public var body: some View {
        NavigationStack {
            List {
                Section("Application indépendante") {
                    Text("Paris Subway 3D est une application indépendante de visualisation 3D du réseau métro et RER parisien. Elle n’est ni affiliée, ni sponsorisée, ni approuvée par la RATP ou Île-de-France Mobilités (IDFM).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Sources Open Data") {
                    LabeledContent("Horaires & arrêts", value: "IDFM GTFS (Licence Ouverte 2.0)")
                    LabeledContent("Tracés géographiques", value: "Open Data IDFM / OSM")
                    LabeledContent("Réseau chargé", value: "\(vm.lines.count) lignes · \(vm.stations.count) stations")
                }

                Section("Mises à jour horaires (OTA)") {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Source active")
                                .font(.subheadline)
                            Text(vm.dataSync.lastSyncMessage)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if vm.dataSync.isSyncing {
                            ProgressView()
                        } else {
                            Button("Vérifier") {
                                Task {
                                    await vm.checkScheduleUpdates()
                                }
                            }
                            .font(.subheadline.weight(.semibold))
                        }
                    }
                    Text("L’application démarre instantanément hors ligne depuis les données embarquées, puis vérifie en arrière-plan si de nouveaux horaires théoriques sont disponibles sans nécessiter de mise à jour App Store.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("À propos & Open Data")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}
