'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface PriceSliderProps {
  minValue: number
  maxValue: number
  currentMin: number
  currentMax: number
  onMinChange: (value: number) => void
  onMaxChange: (value: number) => void
  step?: number
  label?: string
}

export function PriceSlider({
  minValue,
  maxValue,
  currentMin,
  currentMax,
  onMinChange,
  onMaxChange,
  step = 1000,
  label = 'Price Range',
}: PriceSliderProps) {
  const [min, setMin] = useState(currentMin)
  const [max, setMax] = useState(currentMax)

  useEffect(() => {
    setMin(currentMin)
    setMax(currentMax)
  }, [currentMin, currentMax])

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = Math.min(Number(e.target.value), max)
    setMin(newMin)
    onMinChange(newMin)
  }

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = Math.max(Number(e.target.value), min)
    setMax(newMax)
    onMaxChange(newMax)
  }

  const getPercentage = (value: number) => ((value - minValue) / (maxValue - minValue)) * 100

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium text-foreground">{label}</label>

      {/* Slider Track */}
      <div className="relative pt-2 pb-4">
        <div className="absolute top-6 left-0 right-0 h-2 bg-secondary rounded-full" />

        {/* Filled Range */}
        <div
          className="absolute top-6 h-2 bg-primary rounded-full"
          style={{
            left: `${getPercentage(min)}%`,
            right: `${100 - getPercentage(max)}%`,
          }}
        />

        {/* Min Slider */}
        <input
          type="range"
          min={minValue}
          max={maxValue}
          value={min}
          onChange={handleMinChange}
          className="absolute top-4 left-0 right-0 w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer pointer-events-none z-5"
          style={{
            WebkitAppearance: 'slider-horizontal',
          }}
        />

        {/* Max Slider */}
        <input
          type="range"
          min={minValue}
          max={maxValue}
          value={max}
          onChange={handleMaxChange}
          className="absolute top-4 left-0 right-0 w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer pointer-events-none z-6"
          style={{
            WebkitAppearance: 'slider-horizontal',
          }}
        />
      </div>

      {/* Display Values */}
      <div className="flex items-center justify-between pt-2 px-1">
        <div className="text-sm font-medium text-foreground">
          ₹{Math.round(min / 100).toLocaleString('en-IN')}
        </div>
        <span className="text-xs text-muted-foreground">to</span>
        <div className="text-sm font-medium text-foreground">
          ₹{Math.round(max / 100).toLocaleString('en-IN')}
        </div>
      </div>

      <style>{`
        input[type='range']::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--color-primary, rgb(var(--primary) / var(--tw-bg-opacity, 1)));
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          pointer-events: auto;
        }

        input[type='range']::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--color-primary, rgb(var(--primary) / var(--tw-bg-opacity, 1)));
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          pointer-events: auto;
        }

        input[type='range']::-webkit-slider-thumb:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          transform: scale(1.1);
        }

        input[type='range']::-moz-range-thumb:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          transform: scale(1.1);
        }
      `}</style>
    </div>
  )
}
