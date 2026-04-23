import { Product, ProductSize } from "../../types";
import { Plus } from "lucide-react";
import { useState } from "react";

interface Props {
  product: Product;
  onAdd: (product: Product, size: ProductSize) => void;
}

export function ProductCard({ product, onAdd }: Props) {
  const [selectedSizeId, setSelectedSizeId] = useState<number>(product.sizes[0]?.id || 0);

  const selectedSize = product.sizes.find(s => s.id === selectedSizeId) || product.sizes[0];

  return (
    <div className={`relative bg-white rounded-[28px] p-3 md:p-4 lg:p-6 shadow-sm border ${product.isSoldOut ? "border-red-200" : "border-zinc-200 hover:border-orange-200 hover:shadow-xl hover:shadow-orange-500/5"} transition-all flex flex-col justify-between group h-full overflow-hidden`}>
      {product.isSoldOut && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
        </div>
      )}
      <div className={product.isSoldOut ? "opacity-50 grayscale pointer-events-none" : ""}>
      <div>
        <div className="flex justify-between items-start mb-3 lg:mb-4">
          <h3 className="text-lg lg:text-xl font-black text-zinc-900 leading-tight tracking-tight">{product.name}</h3>
          {product.isSoldOut && (
            <span className="bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg whitespace-nowrap">
              Agotado
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-xs lg:text-sm font-medium text-zinc-400 line-clamp-2 mb-4 lg:mb-6 leading-relaxed">
            {product.description}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 mt-auto">
        <div className="flex flex-wrap gap-1.5 lg:gap-2">
          {product.sizes.map(size => (
            <button
              key={size.id}
              onClick={() => setSelectedSizeId(size.id)}
              className={`flex-1 min-w-[70px] px-3 py-2.5 lg:py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${selectedSizeId === size.id
                  ? "bg-zinc-900 border-zinc-900 text-white shadow-lg shadow-zinc-900/20"
                  : "bg-zinc-50 border-zinc-100 text-zinc-400 hover:bg-zinc-100 lg:hover:border-zinc-200"
                }`}
            >
              {size.name}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none mb-1">Precio Unit</p>
            <p className="text-xl lg:text-2xl font-black text-orange-600 tracking-tighter">
              ${selectedSize?.price?.toLocaleString() || "0"}
            </p>
          </div>

          <button
            onClick={() => selectedSize && onAdd(product, selectedSize)}
            disabled={product.isSoldOut || !selectedSize}
            className="w-14 h-14 lg:w-12 lg:h-12 bg-orange-500 hover:bg-orange-600 active:scale-90 disabled:opacity-50 disabled:active:scale-100 text-white rounded-[20px] flex items-center justify-center transition-all shadow-lg shadow-orange-500/20 group-hover:scale-105"
          >
            <Plus strokeWidth={4} size={24} />
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
