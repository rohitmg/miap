import { defineStore } from 'pinia';
import api from '@/services/api'; // Assuming your configured axios/api service is here

/**
 * Interface for a single taxon object.
 * Should match the data from your /api/v1/taxa/all endpoint.
 */
export interface Taxon {
    id: number; // Assuming numeric IDs
    name: string;
}

/**
 * Defines the shape of the taxa store's state.
 */
interface TaxaStoreState {
    /**
     * The complete list of all available taxa, fetched once and cached.
     */
    allTaxa: Taxon[];

    /**
     * A Set containing the IDs of the currently selected taxa for filtering.
     * Using a Set is highly efficient for add, delete, and has (check for existence) operations.
     */
    selectedTaxaIds: Set<number>;

    /**
     * The user's input in the search/filter box for finding taxa to add.
     */
    searchTerm: string;

    loading: boolean;
    error: string | null;
}

export const useTaxaStore = defineStore('taxa', {
    state: (): TaxaStoreState => ({
        allTaxa: [],
        selectedTaxaIds: new Set(),
        searchTerm: '',
        loading: false,
        error: null,
    }),

    getters: {
        /**
         * A getter that returns an array of the full Taxon objects
         * that are currently selected.
         */
        selectedTaxa(state): Taxon[] {
            return state.allTaxa.filter(taxon => state.selectedTaxaIds.has(taxon.id));
        },

        /**
         * A getter that returns a list of taxa available to be added.
         * It filters the full list based on the searchTerm and excludes any
         * taxa that are already in the selection.
         */
        availableTaxaForSelection(state): Taxon[] {
            const searchLower = state.searchTerm.toLowerCase();

            return state.allTaxa.filter(taxon => {
                // Exclude if already selected
                if (state.selectedTaxaIds.has(taxon.id)) {
                    return false;
                }
                // If no search term, show all available (unselected) taxa
                if (!searchLower) {
                    return true;
                }
                // Otherwise, filter by search term
                return taxon.name.toLowerCase().includes(searchLower);
            });
        },
    },

    actions: {
        /**
         * Fetches the complete list of taxa from the API.
         * Implements caching: it will only make a network request if the list is empty.
         */
        async fetchAllTaxa() {
            // Caching logic: If taxa are already loaded, don't fetch again.
            if (this.allTaxa.length > 0) {
                console.log("Using cached taxa list.");
                return;
            }

            this.loading = true;
            this.error = null;
            try {
                const response = await api.get<Taxon[]>('/taxa/all');
                this.allTaxa = response.data;
                console.log(`TaxaStore: Fetched and cached ${this.allTaxa.length} taxa.`);
            } catch (e) {
                this.error = "Failed to load the list of taxa.";
                console.error("fetchAllTaxa error:", e);
            } finally {
                this.loading = false;
            }
        },

        /**
         * Adds a taxon's ID to the current selection.
         */
        selectTaxon(taxonId: number) {
            this.selectedTaxaIds.add(taxonId);
        },

        /**
         * Removes a taxon's ID from the current selection.
         */
        deselectTaxon(taxonId: number) {
            this.selectedTaxaIds.delete(taxonId);
        },

        /**
         * Clears the entire taxa selection.
         */
        clearSelection() {
            this.selectedTaxaIds.clear();
        },

        /**
         * Updates the search term used for filtering available taxa.
         */
        setSearchTerm(term: string) {
            this.searchTerm = term;
        },
    }
});
