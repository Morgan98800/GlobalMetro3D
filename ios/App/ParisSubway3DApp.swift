import SwiftUI

@main
struct ParisSubway3DApp: App {
    @State private var vm = ParisSubwayViewModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if vm.isLoaded {
                    MapScreen(vm: vm)
                } else if let err = vm.loadError {
                    ContentUnavailableView("Erreur de chargement", systemImage: "exclamationmark.triangle", description: Text(err))
                } else {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Chargement du métro parisien…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .task {
                await vm.bootstrap()
            }
        }
    }
}
