import {
    InstantSearch,
    SearchBox,
    Hits,
    RefinementList,
    Pagination,
} from 'react-instantsearch';
import { algoliasearch } from 'algoliasearch';
import type { Hit } from 'instantsearch.js';

// Setup Algolia
const searchClient = algoliasearch('ZLPYTBTZ4R', 'be46d26dfdb299f9bee9146b63c99c77');

type LabelValue = { label: string };
type AlbumHit = {
    objectID: string;
    freedmanTitle: string;
    release_cover?: string;
    performer?: LabelValue | LabelValue[];
    genre?: LabelValue | LabelValue[];
};

// Album Card
function AlbumCard({ hit }: { hit: Hit<AlbumHit> }) {
    const performers = Array.isArray(hit.performer)
        ? hit.performer.map(p => p.label).join(', ')
        : hit.performer?.label ?? '';

    return (
        <a href={`/album/${hit.objectID}`} className="block group space-y-2">
            <img
                src={hit.release_cover ?? '/placeholder.jpg'}
                alt={hit.freedmanTitle}
                className="w-full aspect-square object-cover rounded-lg border border-gray-300 group-hover:shadow-md transition"
            />
            <div className="text-center">
                <h3 className="text-sm font-semibold">{hit.freedmanTitle}</h3>
                {performers && (
                    <p className="text-xs text-gray-500">By {performers}</p>
                )}
            </div>
        </a>
    );
}

// Album Grid Component
export default function AlbumGrid() {
    return (
        <InstantSearch searchClient={searchClient} indexName="dev_JewishMusic">
            <div className="flex flex-col md:flex-row gap-6 p-4">
                {/* Sidebar Filters */}
                <aside className="md:w-1/4 space-y-4">
                    <SearchBox />
                    <RefinementList attribute="genre.label" />
                    <RefinementList attribute="performer.label" />
                </aside>

                {/* Grid Area */}
                <main className="md:w-3/4 space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        <Hits hitComponent={AlbumCard} />
                    </div>
                    <Pagination />
                </main>
            </div>
        </InstantSearch>
    );
}