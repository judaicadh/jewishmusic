import React, { Fragment, useEffect, useMemo, useState } from 'react';
import {
    Configure,
    Hits,
    InstantSearch,
    Pagination,
    RefinementList,
    SearchBox,
    Stats,
    useCurrentRefinements,
} from 'react-instantsearch';
import { algoliasearch } from 'algoliasearch';
import { Dialog, Transition } from '@headlessui/react';
import {
    AudioLines,
    Disc3,
    FileMusic,
    Filter,
    Music4,
    Tag,
    UserRound,
    Waves,
    X,
} from 'lucide-react';

const searchClient = algoliasearch(
    'ZLPYTBTZ4R',
    'be46d26dfdb299f9bee9146b63c99c77'
);

type FilterMode = 'Album' | 'Label' | 'Artist' | 'Composition' | 'Audio Track' | 'Sheet Music';

// typeLabels grouped under the "Audio Track" category.
const AUDIO_TRACK_TYPES = new Set(['audio track', 'musical work', 'song']);

type EntityRef = { label?: string };

type HitType = {
    objectID: string;
    title?: string;
    freedmanTitle?: string;
    // Artists, labels and compositions store their name here (not `title`).
    label?: string;
    release_cover?: string;
    typeLabel?: string;
    performer?: EntityRef | EntityRef[];
    recordLabel?: EntityRef | EntityRef[];
    creator?: EntityRef | EntityRef[];
    composer?: EntityRef | EntityRef[];
    format?: string;
    date?: string;
    wikibaseUrl?: string;
};

const modes: Array<{
    label: FilterMode;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { label: 'Album', icon: Disc3 },
    { label: 'Artist', icon: UserRound },
    { label: 'Label', icon: Tag },
    { label: 'Composition', icon: Music4 },
    { label: 'Audio Track', icon: AudioLines },
    { label: 'Sheet Music', icon: FileMusic },
];

// A nested array means OR within a category.
const facetFiltersByMode: Record<FilterMode, Array<string | string[]>> = {
    Album: ['typeLabel:album'],
    Label: ['typeLabel:Record Label'],
    Artist: [['typeLabel:human', 'typeLabel:artist', 'typeLabel:choir']],
    Composition: ['typeLabel:musical work/composition'],
    'Audio Track': [['typeLabel:audio track', 'typeLabel:musical work', 'typeLabel:song']],
    'Sheet Music': ['typeLabel:sheet music'],
};

const typeBadgeStyles: Record<string, string> = {
    album: 'bg-white/15 text-white border-white/15',
    'Record Label': 'bg-yellow-400/15 text-yellow-100 border-yellow-300/20',
    human: 'bg-emerald-400/15 text-emerald-100 border-emerald-300/20',
    artist: 'bg-emerald-400/15 text-emerald-100 border-emerald-300/20',
    choir: 'bg-emerald-400/15 text-emerald-100 border-emerald-300/20',
    'musical work/composition': 'bg-fuchsia-400/15 text-fuchsia-100 border-fuchsia-300/20',
    // The three "audio track" category members are conceptually distinct and get
    // their own colors so a recording reads differently from the work it performs.
    'audio track': 'bg-sky-400/15 text-sky-100 border-sky-300/20',
    'musical work': 'bg-indigo-400/15 text-indigo-100 border-indigo-300/20',
    song: 'bg-violet-400/15 text-violet-100 border-violet-300/20',
    'sheet music': 'bg-cyan-400/15 text-cyan-100 border-cyan-300/20',
};

// Human-friendly badge text for the raw Wikibase typeLabels.
const typeDisplayLabels: Record<string, string> = {
    album: 'Album',
    'Record Label': 'Label',
    human: 'Artist',
    artist: 'Artist',
    choir: 'Choir',
    'musical work/composition': 'Composition',
    'audio track': 'Audio track',
    'musical work': 'Musical work',
    song: 'Song',
    'sheet music': 'Sheet music',
};

function getTypeDisplayLabel(typeLabel?: string, fallback = ''): string {
    if (!typeLabel) return fallback;
    return typeDisplayLabels[typeLabel] ?? typeLabel;
}

function cn(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(' ');
}

function toLabelList(value?: EntityRef | EntityRef[]): string {
    if (!value) return '';
    if (Array.isArray(value)) {
        return value
            .map((item) => item?.label?.trim())
            .filter(Boolean)
            .join(', ');
    }
    return value.label?.trim() ?? '';
}

function getPrimaryMeta(hit: HitType): string {
    if (hit.typeLabel === 'musical work/composition') {
        return toLabelList(hit.composer) || toLabelList(hit.performer) || toLabelList(hit.creator) || 'Explore record';
    }
    return (
        toLabelList(hit.performer) ||
        toLabelList(hit.composer) ||
        toLabelList(hit.creator) ||
        toLabelList(hit.recordLabel) ||
        'Explore record'
    );
}

function getSecondaryMeta(hit: HitType): string {
    if (hit.typeLabel === 'sheet music') {
        return hit.format?.trim() || 'Score';
    }
    return hit.date?.trim() || '';
}

function getRoutePrefix(mode: FilterMode): string {
    return {
        Album: 'album',
        Label: 'label',
        Artist: 'artist',
        Composition: 'composition',
        'Audio Track': 'composition',
        'Sheet Music': 'sheet-music',
    }[mode];
}

function TypeFallback({ typeLabel }: { typeLabel?: string }) {
    const iconClass = 'h-10 w-10 text-white/85';

    if (typeLabel === 'album') return <Disc3 className={iconClass} />;
    if (typeLabel === 'human' || typeLabel === 'artist' || typeLabel === 'choir')
        return <UserRound className={iconClass} />;
    if (typeLabel === 'Record Label') return <Tag className={iconClass} />;
    if (typeLabel === 'sheet music') return <FileMusic className={iconClass} />;
    // A recording (audio track) gets a waveform; works/songs/compositions get a note.
    if (typeLabel === 'audio track') return <AudioLines className={iconClass} />;
    return <Music4 className={iconClass} />;
}

function CurrentRefinementChips() {
    const { items, refine } = useCurrentRefinements();

    const chips = useMemo(
        () =>
            items.flatMap((item) =>
                item.refinements.map((refinement) => ({
                    label: String(refinement.label),
                    attributeLabel: item.label,
                    refineValue: refinement,
                }))
            ),
        [items]
    );

    if (!chips.length) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {chips.map((chip, index) => (
                <button
                    key={`${chip.attributeLabel}-${chip.label}-${index}`}
                    onClick={() => refine(chip.refineValue)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur transition hover:bg-white/10"
                    type="button"
                >
          <span>
            {chip.attributeLabel}: {chip.label}
          </span>
                    <X className="h-3.5 w-3.5" />
                </button>
            ))}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="col-span-full rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-20 text-center backdrop-blur-sm">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <AudioLines className="h-7 w-7 text-white/70" />
            </div>
            <h3 className="text-xl font-semibold text-white">Nothing matched that search</h3>
            <p className="mt-2 text-sm text-white/55">
                Try a broader keyword or clear a few filters.
            </p>
        </div>
    );
}

function ResultCard({
    hit,
    mode,
    covers,
    trackAlbums,
    trackWorks,
}: {
    hit: HitType;
    mode: FilterMode;
    covers: Record<string, string>;
    trackAlbums: Record<string, string>;
    trackWorks: Record<string, string>;
}) {
    const title = hit.title ?? hit.freedmanTitle ?? hit.label ?? 'Untitled';
    // Algolia doesn't carry the cover; fall back to the Wikibase P160 map by id.
    const image = hit.release_cover?.trim() || covers[hit.objectID];
    const primaryMeta = getPrimaryMeta(hit);
    const secondaryMeta = getSecondaryMeta(hit);
    const routePrefix = getRoutePrefix(mode);

    // Audio tracks have no detail page of their own. Link priority:
    //   1. the composition it's a "recording or performance of" (P118),
    //   2. otherwise the album it appears on.
    // Never link out to Wikibase.
    const href = AUDIO_TRACK_TYPES.has(hit.typeLabel ?? '')
        ? trackWorks[hit.objectID]
            ? `/composition/${trackWorks[hit.objectID]}`
            : trackAlbums[hit.objectID]
                ? `/album/${trackAlbums[hit.objectID]}`
                : undefined
        : `/${routePrefix}/${hit.objectID}`;

    return (
        <a
            href={href}
            className="group block overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.03] shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05] hover:shadow-[0_20px_40px_rgba(0,0,0,0.35)]"
        >
            <div className="relative aspect-[0.85] overflow-hidden">
                {image ? (
                    <>
                        <img
                            src={image}
                            alt={title}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                    </>
                ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(217,70,239,0.18),transparent_35%)] bg-zinc-900">
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_35%,rgba(255,255,255,0.02))]" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                                <TypeFallback typeLabel={hit.typeLabel} />
                            </div>
                            <div className="max-w-[85%]">
                                <p className="line-clamp-2 text-sm font-medium text-white/85">
                                    {getTypeDisplayLabel(hit.typeLabel, mode)}
                                </p>
                                <p className="mt-1 text-xs text-white/45">No image available</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
            <span
                className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur',
                    typeBadgeStyles[hit.typeLabel ?? ''] ?? 'bg-white/15 text-white border-white/15'
                )}
            >
              {getTypeDisplayLabel(hit.typeLabel, mode)}
            </span>
                        <div className="rounded-full bg-black/35 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
                            View
                        </div>
                    </div>
                    <h3 className="line-clamp-2 text-lg font-semibold leading-tight text-white">
                        {title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm text-white/70">{primaryMeta}</p>
                    {secondaryMeta ? (
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/40">
                            {secondaryMeta}
                        </p>
                    ) : null}
                </div>
            </div>
        </a>
    );
}

function FilterSection({
                           title,
                           attribute,
                           searchable = false,
                       }: {
    title: string;
    attribute: string;
    searchable?: boolean;
}) {
    return (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-3 text-sm font-semibold text-white/90">{title}</h3>
            <RefinementList
                attribute={attribute}
                searchable={searchable}
                showMore
                limit={8}
                showMoreLimit={20}
                classNames={{
                    root: 'space-y-3',
                    searchBox:
                        'mb-3 [&_.ais-SearchBox-input]:w-full [&_.ais-SearchBox-input]:rounded-2xl [&_.ais-SearchBox-input]:border [&_.ais-SearchBox-input]:border-white/10 [&_.ais-SearchBox-input]:bg-white/[0.04] [&_.ais-SearchBox-input]:px-3 [&_.ais-SearchBox-input]:py-2.5 [&_.ais-SearchBox-input]:text-sm [&_.ais-SearchBox-input]:text-white [&_.ais-SearchBox-input]:outline-none [&_.ais-SearchBox-input]:placeholder:text-white/35 [&_.ais-SearchBox-input]:focus:border-fuchsia-400/40 [&_.ais-SearchBox-input]:focus:ring-2 [&_.ais-SearchBox-input]:focus:ring-fuchsia-500/20',
                    list: 'max-h-64 space-y-1.5 overflow-auto pr-1',
                    label:
                        'flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-2 py-2 text-sm text-white/75 transition hover:bg-white/[0.05] hover:text-white',
                    checkbox:
                        'mr-3 h-4 w-4 rounded border-white/20 bg-transparent text-fuchsia-500 focus:ring-fuchsia-500/30',
                    labelText: 'flex-1 truncate',
                    count:
                        'rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/45',
                    showMore: 'pt-1 text-sm font-medium text-fuchsia-300 hover:text-fuchsia-200',
                }}
            />
        </section>
    );
}

function runDevAssertions() {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
        return;
    }

    console.assert(toLabelList(undefined) === '', 'toLabelList handles missing values');
    console.assert(
        toLabelList([{ label: 'A' }, { label: 'B' }]) === 'A, B',
        'toLabelList joins arrays'
    );
    console.assert(
        getPrimaryMeta({ objectID: '1', composer: [{ label: 'Lewandowski' }] }) === 'Lewandowski',
        'getPrimaryMeta prefers meaningful contributor fields'
    );
    console.assert(
        getSecondaryMeta({ objectID: '2', typeLabel: 'sheet music' }) === 'Score',
        'sheet music defaults to Score when format is absent'
    );
    console.assert(
        getRoutePrefix('Sheet Music') === 'sheet-music',
        'Sheet Music routes correctly'
    );
}

runDevAssertions();

export default function AlbumGrid() {
    const [filterMode, setFilterMode] = useState<FilterMode>('Album');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [covers, setCovers] = useState<Record<string, string>>({});
    const [trackAlbums, setTrackAlbums] = useState<Record<string, string>>({});
    const [trackWorks, setTrackWorks] = useState<Record<string, string>>({});

    useEffect(() => {
        fetch('/album-covers.json')
            .then((r) => (r.ok ? r.json() : {}))
            .then(setCovers)
            .catch(() => {});
        fetch('/track-albums.json')
            .then((r) => (r.ok ? r.json() : {}))
            .then(setTrackAlbums)
            .catch(() => {});
        fetch('/track-works.json')
            .then((r) => (r.ok ? r.json() : {}))
            .then(setTrackWorks)
            .catch(() => {});
    }, []);

    return (
        <InstantSearch searchClient={searchClient} indexName="dev_JewishMusic">
            <Configure facetFilters={facetFiltersByMode[filterMode]} hitsPerPage={16} />

            <div className="min-h-screen bg-[#07070b] text-white">
                <div className="relative isolate overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_25%),radial-gradient(circle_at_bottom,rgba(236,72,153,0.12),transparent_30%)]" />
                    <div className="absolute inset-x-0 top-0 h-px bg-white/10" />

                    <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
                        <div className="mb-8 rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl md:p-7 lg:p-8">
                            <div className="flex flex-col gap-8">
                                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                                    <div className="max-w-3xl">
                                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/75">
                                            <Waves className="h-3.5 w-3.5" />
                                            Digital collection search
                                        </div>
                                        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                                            Discover the archive like a streaming library.
                                        </h1>
                                        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                                            Search albums, artists, labels, compositions, and sheet music in a more immersive, modern music-style interface.
                                        </p>
                                    </div>

                                    <div className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                                            Collection stats
                                        </div>
                                        <Stats classNames={{ root: 'mt-1 text-sm text-white/75' }} />
                                    </div>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                                    <div className="flex-1 [&_.ais-SearchBox-form]:relative [&_.ais-SearchBox-input]:h-14 [&_.ais-SearchBox-input]:w-full [&_.ais-SearchBox-input]:rounded-[20px] [&_.ais-SearchBox-input]:border [&_.ais-SearchBox-input]:border-white/10 [&_.ais-SearchBox-input]:bg-white/[0.05] [&_.ais-SearchBox-input]:pl-5 [&_.ais-SearchBox-input]:pr-5 [&_.ais-SearchBox-input]:text-sm [&_.ais-SearchBox-input]:text-white [&_.ais-SearchBox-input]:shadow-inner [&_.ais-SearchBox-input]:outline-none [&_.ais-SearchBox-input]:backdrop-blur [&_.ais-SearchBox-input]:transition [&_.ais-SearchBox-input]:placeholder:text-white/35 [&_.ais-SearchBox-input]:focus:border-fuchsia-400/40 [&_.ais-SearchBox-input]:focus:ring-4 [&_.ais-SearchBox-input]:focus:ring-fuchsia-500/15 [&_.ais-SearchBox-submit]:hidden [&_.ais-SearchBox-reset]:hidden">
                                        <SearchBox placeholder="Search albums, artists, labels, compositions, sheet music..." />
                                    </div>

                                    <button
                                        onClick={() => setIsModalOpen(true)}
                                        className="inline-flex h-14 items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-white/[0.05] px-5 text-sm font-medium text-white/85 backdrop-blur transition hover:bg-white/[0.08]"
                                        type="button"
                                    >
                                        <Filter className="h-4 w-4" />
                                        Filters
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    {modes.map((option) => {
                                        const Icon = option.icon;
                                        const active = filterMode === option.label;

                                        return (
                                            <button
                                                key={option.label}
                                                onClick={() => setFilterMode(option.label)}
                                                className={cn(
                                                    'inline-flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-medium transition',
                                                    active
                                                        ? 'border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500/20 to-cyan-400/15 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_10px_30px_rgba(192,38,211,0.18)]'
                                                        : 'border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/[0.06] hover:text-white'
                                                )}
                                                type="button"
                                            >
                                                <Icon className="h-4 w-4" />
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <CurrentRefinementChips />
                            </div>
                        </div>

                        {filterMode === 'Sheet Music' ? (
                            <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-20 text-center">
                                <FileMusic className="h-10 w-10 text-white/40" />
                                <h3 className="mt-4 text-xl font-semibold text-white">Sheet music — coming soon</h3>
                                <p className="mt-2 max-w-md text-sm text-white/50">
                                    Scores from the collection aren’t available to browse here yet. In the
                                    meantime, explore albums, artists, labels, and compositions.
                                </p>
                            </div>
                        ) : (
                            <>
                                <Hits
                                    hitComponent={({ hit }) => <ResultCard hit={hit as HitType} mode={filterMode} covers={covers} trackAlbums={trackAlbums} trackWorks={trackWorks} />}
                                    classNames={{
                                        list: 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                                        emptyRoot: 'grid grid-cols-1',
                                    }}
                                    emptyComponent={EmptyState}
                                />

                                <Pagination
                                    classNames={{
                                        root: 'mt-10 flex justify-center',
                                        list: 'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-2 backdrop-blur',
                                        link: 'flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm text-white/70 transition hover:bg-white/[0.08] hover:text-white',
                                        selectedItem: 'rounded-full bg-white text-black',
                                        disabledItem: 'pointer-events-none opacity-30',
                                    }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            <Transition appear show={isModalOpen} as={Fragment}>
                <Dialog as="div" className="relative z-50" onClose={() => setIsModalOpen(false)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-200"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-150"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-hidden">
                        <div className="absolute inset-0 overflow-hidden">
                            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                                <Transition.Child
                                    as={Fragment}
                                    enter="transform transition ease-out duration-300"
                                    enterFrom="translate-x-full"
                                    enterTo="translate-x-0"
                                    leave="transform transition ease-in duration-200"
                                    leaveFrom="translate-x-0"
                                    leaveTo="translate-x-full"
                                >
                                    <Dialog.Panel className="pointer-events-auto w-screen max-w-md border-l border-white/10 bg-[#0b0b12]/95 shadow-2xl backdrop-blur-2xl">
                                        <div className="flex h-full flex-col">
                                            <div className="border-b border-white/10 px-5 py-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <Dialog.Title className="text-lg font-semibold text-white">
                                                            Filters
                                                        </Dialog.Title>
                                                        <p className="mt-1 text-sm text-white/45">
                                                            Shape the library view.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => setIsModalOpen(false)}
                                                        className="rounded-xl p-2 text-white/55 transition hover:bg-white/[0.06] hover:text-white"
                                                        aria-label="Close filters"
                                                        type="button"
                                                    >
                                                        <X className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                                                <FilterSection title="Type" attribute="typeLabel" />
                                                <FilterSection title="Performer" attribute="performer.label" searchable />
                                                <FilterSection title="Composer / Creator" attribute="composer.label" searchable />
                                                <FilterSection title="Record Label" attribute="recordLabel.label" searchable />
                                            </div>
                                        </div>
                                    </Dialog.Panel>
                                </Transition.Child>
                            </div>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </InstantSearch>
    );
}
