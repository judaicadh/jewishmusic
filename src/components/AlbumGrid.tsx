// components/AlbumGrid.tsx
import React from 'react';


type Album = {
    id: string;
    label: string;
    image: string;
};

export default function AlbumGrid({ albums }: { albums: Album[] }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
            {albums.map((album) => (
                <div key={album.id} className="aspect-square overflow-hidden rounded-lg">
                    <img
                        src={album.image}
                        alt={album.label}
                        className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                    />
                </div>
            ))}
        </div>
    );
}