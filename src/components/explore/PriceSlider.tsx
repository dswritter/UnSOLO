'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    setMin(currentMin)
    setMax(currentMax)
  }, [currentMin, currentMax])

  useEffect(() => {
    const handleDragEnd = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setIsDragging(false)
        onMinChange(min)
        onMaxChange(max)
      }
    }

    document.addEventListener('mouseup', handleDragEnd)
    document.addEventListener('touchend', handleDragEnd)

    return () => {
      document.removeEventListener('mouseup', handleDragEnd)
      document.removeEventListener('touchend', handleDragEnd)
    }
  }, [min, max, onMinChange, onMaxChange])

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = Math.min(Number(e.target.value), max)
    setMin(newMin)
  }

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = Math.max(Number(e.target.value), min)
    setMax(newMax)
  }

  const handleDragStart = () => {
    isDraggingRef.current = true
    setIsDragging(true)
  }

  const getPercentage = (value: number) => ((value - minValue) / (maxValue - minValue)) * 100

  return (
    <div className="space-y-4">
      {/* Slider Track */}
      <div className="relative h-6 flex items-center">
        {/* Filled Range */}
        <div
          className="absolute h-2 bg-primary rounded-full"
          style={{
            left: `${getPercentage(min)}%`,
            right: `${100 - getPercentage(max)}%`,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />

        {/* Min Slider */}
        <input
          type="range"
          min={minValue}
          max={maxValue}
          value={min}
          onChange={handleMinChange}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="absolute left-0 right-0 w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer pointer-events-none z-5"
          style={{
            WebkitAppearance: 'slider-horizontal',
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />

        {/* Max Slider */}
        <input
          type="range"
          min={minValue}
          max={maxValue}
          value={max}
          onChange={handleMaxChange}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="absolute left-0 right-0 w-full h-2 bg-transparent rounded-full appearance-none cursor-pointer pointer-events-none z-6"
          style={{
            WebkitAppearance: 'slider-horizontal',
            top: '50%',
            transform: 'translateY(-50%)',
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
        input[type='range'] {
          -webkit-appearance: none;
          appearance: none;
        }

        input[type='range']::-webkit-slider-runnable-track {
          background: transparent;
          border: none;
          outline: none;
        }

        input[type='range']::-moz-range-track {
          background: transparent;
          border: none;
          outline: none;
        }

        input[type='range']::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--color-primary, rgb(var(--primary) / var(--tw-bg-opacity, 1)));
          cursor: pointer;
          border: none;
          box-shadow: none;
          pointer-events: auto;
          transform: translateY(-50%);
          top: 50%;
        }

        input[type='range']::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--color-primary, rgb(var(--primary) / var(--tw-bg-opacity, 1)));
          cursor: pointer;
          border: none;
          box-shadow: none;
          pointer-events: auto;
          transform: translateY(-50%);
        }

        input[type='range']::-webkit-slider-thumb:hover {
          background: var(--color-primary, rgb(var(--primary) / calc(var(--tw-bg-opacity, 1) * 0.9)));
        }

        input[type='range']::-moz-range-thumb:hover {
          background: var(--color-primary, rgb(var(--primary) / calc(var(--tw-bg-opacity, 1) * 0.9)));
        }
      `}</style>
    </div>
  )
}
