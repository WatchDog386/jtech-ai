# Constructly AI - Technical Architecture & Developer Guide

> **Version:** 2.1.0  
> **Last Updated:** February 2026  
> **Audience:** Backend & Frontend Developers, Architects, Contributors

---

## 📑 Table of Contents

1. [System Architecture](#system-architecture)
2. [Calculator Architecture](#calculator-architecture)
3. [Hook Patterns & Conventions](#hook-patterns--conventions)
4. [State Management](#state-management)
5. [Component Patterns](#component-patterns)
6. [Material Pricing System](#material-pricing-system)
7. [Quote Data Model](#quote-data-model)
8. [API Integration Patterns](#api-integration-patterns)
9. [Database Schema Deep Dive](#database-schema-deep-dive)
10. [Performance Optimization](#performance-optimization)
11. [Error Handling Strategy](#error-handling-strategy)
12. [Testing Approach](#testing-approach)
13. [Development Best Practices](#development-best-practices)
14. [How-To Guides](#how-to-guides)
15. [Troubleshooting](#troubleshooting)

---

## System Architecture

### High-Level Overview

Constructly AI follows a **client-centric, modular architecture** optimized for real-time calculations and dynamic data management:

```
┌─────────────────────────────────────────────────────────────┐
│                    React 18+ Frontend                        │
│  (Vite Bundle, TypeScript, Tailwind CSS, shadcn/ui)         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Context Layer (Global State)                 │   │
│  │  AuthContext, ThemeContext, PlanContext              │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        Custom Hooks (Business Logic)                 │   │
│  │  useQuotes, useMasonryCalculator, usePaintingCalc...  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │      Components (UI & Interaction)                   │   │
│  │  Pages, Calculators, Editors, Builders               │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │      Services & Utils (Utilities)                    │   │
│  │  geminiService.ts, planParserService.ts              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           ↓ ↑
        Supabase Client SDK (Auth, Realtime, REST API)
                           ↓ ↑
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database (Supabase)                  │
│  Tables: quotes, profiles, material_prices, subscriptions   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ├─ Authentication: JWT, OAuth 2.0                         │
│  ├─ Real-time Subscriptions: WebSocket (PostgREST)         │
│  ├─ API: Auto-generated REST endpoints                     │
│  └─ Session Management: Secure cookies                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           ↓ ↑
         External APIs (Google Gemini, Paystack)
```

### Data Flow Architecture

#### Quote Creation Flow

```
1. User initiates quote creation
   ↓
2. QuoteBuilder component mounts
   ├─ Calls useQuotes() hook
   ├─ Initializes quote state from localStorage or fresh
   └─ Subscribes to real-time updates
   ↓
3. User interacts with calculators
   ├─ ConcreteCalculator, MasonryCalculator, PaintingCalculator, etc.
   ├─ Each calculator has its own hook (useConcreteCalculator, etc.)
   └─ Calculations run in real-time, state updates locally
   ↓
4. Calculations propagate up
   ├─ Individual calculator totals computed
   ├─ useQuoteCalculations aggregates all sections
   └─ Total quote cost updated in parent state
   ↓
5. Quote saved to Supabase
   ├─ User clicks "Save" or auto-save triggered
   ├─ supabase.from('quotes').upsert(quoteData)
   └─ Triggers real-time subscription updates
   ↓
6. Export/PDF generation
   └─ PDFGenerator reads final quote state and generates output
```

### Modularity Strategy

The application is organized by **functional domain**:

- **Calculators**: Domain-specific calculation logic (concrete, masonry, plumbing, etc.)
- **Components**: UI and interaction layers
- **Hooks**: State management and side effects
- **Services**: External integrations (Gemini, plan parsing)
- **Types**: TypeScript interfaces and enums
- **Utils**: Helper functions (calculations, formatting, validation)
- **Contexts**: Global application state (auth, theme, plans)

---

## Calculator Architecture

### Core Calculator Pattern

Every calculator follows a consistent **5-part pattern**:

#### 1. **Interface Definition** (`types/*.ts`)

```typescript
// types/concrete.ts
export interface ConcreteCalculation {
  volume: number;
  categoryWastage: number;
  totalVolumWithWastage: number;
  density: number;
  totalWeight: number;
  costKES: number;
}

export interface ConcreteInput {
  shape: "rectangular" | "circular";
  length?: number;
  width?: number;
  height: number;
  diameter?: number;
  wastagePercent: number;
  unitPrice: number;
}
```

#### 2. **Calculation Function** (`utils/concreteCalculations.ts`)

```typescript
// Pure functions with no side effects
export function calculateConcreteVolume(
  input: ConcreteInput,
): ConcreteCalculation {
  let volume = 0;

  if (input.shape === "rectangular") {
    volume = (input.length || 0) * (input.width || 0) * input.height;
  } else if (input.shape === "circular") {
    const radius = (input.diameter || 0) / 2;
    volume = Math.PI * Math.pow(radius, 2) * input.height;
  }

  const volumeWithWastage = volume * (1 + input.wastagePercent / 100);
  const totalWeight = volumeWithWastage * input.density;

  return {
    volume,
    categoryWastage: volumeWithWastage - volume,
    totalVolumWithWastage: volumeWithWastage,
    density: input.density,
    totalWeight,
    costKES: totalWeight * input.unitPrice,
  };
}
```

#### 3. **Hook Implementation** (`hooks/useConcreteCalculator.ts`)

```typescript
export interface UseConcreteCalculatorProps {
  initialData?: ConcreteInput;
  materialPrices?: Material[];
  quote?: any;
  onCalculationsChange?: (calcs: ConcreteCalculation) => void;
}

export function useConcreteCalculator({
  initialData,
  materialPrices = [],
  quote,
  onCalculationsChange,
}: UseConcreteCalculatorProps) {
  // 1. State Management
  const [input, setInput] = useState<ConcreteInput>(
    initialData || DEFAULT_INPUT,
  );
  const [calculations, setCalculations] = useState<ConcreteCalculation | null>(
    null,
  );

  // 2. Material Price Fetching
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  useEffect(() => {
    const price = getMaterialPrice("Concrete", "20mm", materialPrices);
    setPriceMap({ concrete: price });
  }, [materialPrices]);

  // 3. Calculation Logic (Pure, re-runs on input change)
  useEffect(() => {
    const result = calculateConcreteVolume({
      ...input,
      unitPrice: priceMap.concrete || 0,
    });
    setCalculations(result);
  }, [input, priceMap]);

  // 4. Propagation (Notify parent of changes)
  useEffect(() => {
    if (onCalculationsChange && calculations) {
      onCalculationsChange(calculations);
    }
    // ⚠️ Removed from dependencies: onCalculationsChange callback
    // This prevents infinite loops from parent re-creating callback
  }, [calculations]);

  // 5. Return API
  return {
    input,
    setInput,
    calculations,
    priceMap,
  };
}
```

#### 4. **Component Integration** (`components/ConcreteCalculatorForm.tsx`)

```typescript
export function ConcreteCalculatorForm({
  quoteData,
  setQuoteData,
  materialPrices,
}: Props) {
  const { input, setInput, calculations } = useConcreteCalculator({
    initialData: quoteData.concrete_input,
    materialPrices,
    quote: quoteData,
    onCalculationsChange: (calcs) => {
      setQuoteData((prev) => ({
        ...prev,
        concrete_totals: calcs,
      }));
    },
  });

  return (
    <Card>
      <CardContent>
        <Input
          value={input.height}
          onChange={(e) =>
            setInput({ ...input, height: parseFloat(e.target.value) })
          }
        />
        {calculations && (
          <div>
            <p>Total Cost: KES {calculations.costKES.toLocaleString()}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

#### 5. **Quote Integration** (`components/QuoteBuilder.tsx`)

```typescript
const handleConcreteChange = useCallback((calcs: ConcreteCalculation) => {
  setQuoteData((prev) => ({
    ...prev,
    concrete_input: concreteInput,
    concrete_totals: calcs,
  }));
}, []);

// Render concrete calculator
<ConcreteCalculatorForm
  quoteData={quoteData}
  setQuoteData={setQuoteData}
  materialPrices={materialPrices}
/>
```

### Calculator Hooks: Reference List

All calculator hooks follow the same pattern and return:

- `input`: Current form input state
- `setInput`: Setter for form inputs
- `calculations`: Computed results
- `priceMap`: Material price lookup

| Hook                             | Domain         | Key Calculations                           |
| -------------------------------- | -------------- | ------------------------------------------ |
| `useConcreteCalculator`          | Concrete       | Volume, wastage, weight, cost              |
| `useMasonryCalculatorNew`        | Masonry/Bricks | Brick counts, mortar, labor, doors/windows |
| `usePaintingCalculator`          | Painting       | Multi-layer coverage, wastage, coats       |
| `usePlumbingCalculator`          | Plumbing       | Pipe lengths, fittings, labor              |
| `useElectricalCalculator`        | Electrical     | Wire gauges, circuits, labor               |
| `useRoofingCalculator`           | Roofing        | Material quantities, pitch, labor          |
| `useRebarCalculator`             | Rebar          | Steel bar counts, weights, spacing         |
| `useFlooringCalculator`          | Flooring       | Area, adhesive, subfloor, labor            |
| `useExternalFinishesCalculator`  | Ext. Finishes  | Cladding, plaster, painting                |
| `useInternalFinishesCalculator`  | Int. Finishes  | Flooring, trim, paint, wet areas           |
| `useFoundationWallingCalculator` | Foundation     | Footings, blocks, concrete                 |
| `useWallingCalculator`           | Walling        | Brick/block walls, mortar, plaster         |
| `useEquipmentCalculator`         | Equipment      | Rental rates, daily/weekly costs           |
| `useServicesCalculator`          | Services       | Third-party service pricing                |

### Key Design Principles

1. **Pure Calculations**: All `calculate*()` functions are pure and testable
2. **Single Responsibility**: Each hook manages ONE calculator only
3. **Callback Stability**: Use `useCallback` to wrap parent props before passing to hooks
4. **Real-time Updates**: Components re-render only when their input changes
5. **Lazy Material Fetching**: Prices loaded asynchronously, defaults used initially

---

## Hook Patterns & Conventions

### Hook Execution Order

All calculator hooks follow this sequence:

```typescript
export function useCalculator(props: Props) {
  // 1. Initialize state
  const [input, setInput] = useState(initialValue);
  const [calculations, setCalculations] = useState(null);
  const [priceMap, setPriceMap] = useState({});

  // 2. Fetch material prices (async)
  useEffect(
    () => {
      fetchMaterialPrices().then(setPriceMap);
    },
    [
      /* material dependencies only */
    ],
  );

  // 3. Perform calculations (sync)
  useEffect(() => {
    const result = calculate(input, priceMap);
    setCalculations(result);
  }, [input, priceMap]);

  // 4. Propagate results to parent (callback)
  useEffect(() => {
    if (onResultsChange) {
      onResultsChange(calculations);
    }
  }, [calculations]); // ⚠️ NO callback in dependencies!

  // 5. Return API
  return { input, setInput, calculations, priceMap };
}
```

### Common Pitfalls & Solutions

#### Pitfall 1: Infinite Loop from Callback

**❌ Wrong:**

```typescript
useEffect(() => {
  onCalculationsChange(calculations);
}, [calculations, onCalculationsChange]); // 🔴 Callback in deps = infinite loop
```

**✅ Correct:**

```typescript
// In parent BEFORE passing to hook:
const handleCalcsChange = useCallback((calcs) => {
  setQuoteData((prev) => ({ ...prev, totals: calcs }));
}, []); // Empty deps = stable reference

// Then pass to hook:
useCalculator({ onCalculationsChange: handleCalcsChange });

// In hook:
useEffect(() => {
  if (onCalculationsChange) {
    onCalculationsChange(calculations);
  }
}, [calculations]); // ✅ Callback removed from deps
```

#### Pitfall 2: Stale Closures with Material Prices

**❌ Wrong:**

```typescript
const [priceMap, setPriceMap] = useState({});

useEffect(() => {
  const result = calculateCost(input, priceMap);
  setCalculations(result);
}, [input]); // 🔴 priceMap not in deps = uses stale prices
```

**✅ Correct:**

```typescript
useEffect(() => {
  const result = calculateCost(input, priceMap);
  setCalculations(result);
}, [input, priceMap]); // ✅ Both dependencies included
```

#### Pitfall 3: Unnecessary Re-renders from Object Creation

**❌ Wrong:**

```typescript
<Calculator
  config={{ material: "concrete", size: "20mm" }} // 🔴 New object each render
/>
```

**✅ Correct:**

```typescript
const config = useMemo(
  () => ({ material: "concrete", size: "20mm" }),
  [calculatorType] // Only recreate when calculatorType changes
);
<Calculator config={config} />
```

### Hook Naming Conventions

- `use*Calculator`: Main calculation hook for a domain (e.g., `useConcreteCalculator`)
- `use*Prices`: Hook for fetching material/labor prices
- `use*Data`: Hook for fetching and managing data from Supabase
- `use*Settings`: Hook for user preferences and configuration
- `useQuoteCalculations`: Aggregator for all calculator totals

---

## State Management

### Context Layer

Three contexts manage global application state:

#### AuthContext

**Purpose**: Authentication state and user identity

```typescript
interface AuthContextType {
  user: User | null; // Supabase Auth User
  profile: Profile | null; // User profile from DB
  loading: boolean; // Initial load state
  authReady: boolean; // Auth initialized

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (data: Profile) => Promise<void>;
}
```

**Usage Pattern:**

```typescript
const { user, profile, signOut } = useAuth();

if (!user) {
  return <Navigate to="/auth" />;
}
```

#### ThemeContext

**Purpose**: Dark/light mode toggling

```typescript
interface ThemeContextType {
  theme: "light" | "dark";
  toggleTheme: () => void;
}
```

**Implementation Details:**

- Persists to `localStorage` under key `"theme"`
- Applies CSS class `dark` to document root
- Integrates with Tailwind CSS dark mode
- Uses system preference as default

#### PlanContext

**Purpose**: File uploads and extracted plan data

```typescript
interface PlanContextType {
  extractedPlan: ExtractedPlan | null;
  setExtractedPlan: (plan: ExtractedPlan) => void;
}

interface ExtractedPlan {
  walls?: WallSection[];
  doors?: Door[];
  windows?: Window[];
  plumbing?: PlumbingSystem[];
  electrical?: ElectricalSystem[];
  roofing?: RoofingConfiguration[];
  // ... other extracted elements
}
```

**Usage Pattern:**

```typescript
const { extractedPlan } = usePlan();

// After plan upload
const results = await analyzeWithGemini(imageFile);
setExtractedPlan(results);
```

### Local State Patterns

#### Quote State in QuoteBuilder

```typescript
interface QuoteData {
  // Project info
  projectName: string;
  clientName: string;
  clientEmail: string;
  location: string;

  // Calculator inputs & outputs
  concrete_input: ConcreteInput;
  concrete_totals: ConcreteCalculation;

  masonry_walls: WallSection[];
  doors: Door[];
  windows: Window[];

  paintings_specifications: PaintingSpecification[];

  // Summary
  total_cost: number;
  contingency_percent: number;
  final_total: number;
}

// Management
const [quoteData, setQuoteData] = useState<QuoteData>(initialQuote);

// Update pattern (immutable)
setQuoteData((prev) => ({
  ...prev,
  concrete_totals: newTotals,
}));
```

### State Synchronization Strategy

**Real-time Updates:**

```typescript
// In Dashboard.tsx
useEffect(() => {
  const subscription = supabase
    .from("quotes")
    .on("*", (payload) => {
      // Quote changed in DB (by user or other session)
      setQuoteData(payload.new);
    })
    .subscribe();

  return () => subscription.unsubscribe();
}, []);
```

**Auto-save Strategy:**

```typescript
// Debounced save to Supabase
const debouncedSave = useCallback(
  debounce(async (data: QuoteData) => {
    await supabase.from("quotes").upsert(data);
  }, 2000),
  [],
);

useEffect(() => {
  debouncedSave(quoteData);
}, [quoteData, debouncedSave]);
```

---

## Component Patterns

### Pattern 1: Optional Feature Checkboxes

Many components support **optional features controlled by checkboxes**. This pattern allows users to include/exclude features dynamically.

#### Example: Internal Finishes Paint Checkbox

**Component Structure:**

```typescript
export function InternalFinishesCalculator({
  quoteData,
  setQuoteData,
  materialPrices,
}: Props) {
  // Smart initialization: enable paint if paintings already exist
  const [includePaint, setIncludePaint] = useState<boolean>(
    (quoteData?.paintings_specifications?.filter(
      (p: any) => p.location === "Interior Walls"
    ) || []).length > 0
  );

  const { input, calculations } = usePaintingCalculator({
    initialPaintings: quoteData?.paintings_specifications?.filter(
      (p: any) => p.location === "Interior Walls"
    ),
    materialPrices,
    quote: quoteData,
    onPaintingsChange: (paintings) => {
      setQuoteData((prev) => ({
        ...prev,
        paintings_specifications: [
          ...prev.paintings_specifications?.filter(
            (p: any) => p.location !== "Interior Walls"
          ) || [],
          ...paintings,
        ],
      }));
    },
  });

  return (
    <Card>
      {/* Always visible: Material finishes */}
      <div>
        <h3>Materials</h3>
        {/* Stone, tiles, wood, stucco options */}
      </div>

      {/* Conditional: Paint section */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-paint"
            checked={includePaint}
            onCheckedChange={setIncludePaint}
          />
          <Label htmlFor="include-paint">Include Paint</Label>
        </div>

        {includePaint && (
          <div className="mt-4">
            <PaintingCard
              painting={input}
              onUpdate={(updated) => setInput(updated)}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
```

**Key Principles:**

1. **State for checkbox**: Separate boolean state for visibility
2. **Smart initialization**: Check if data already exists to auto-enable
3. **Conditional rendering**: Use `{includePaint && <Component />}`
4. **Data consistency**: Always sync checkbox state with data presence

#### Example: Door Transom Checkbox

```typescript
// In DoorsWindowsEditor.tsx
<Checkbox
  id="transom-enable"
  checked={doorItem.transom?.enabled ?? false}
  onCheckedChange={(checked) =>
    onUpdate("transom", {
      ...doorItem.transom,
      enabled: !!checked,
    })
  }
  disabled={readonly}
/>

{/* Transom inputs only visible/editable when enabled */}
<Input
  placeholder="Height (mm)"
  value={doorItem.transom?.height ?? ""}
  onChange={(e) =>
    onUpdate("transom", {
      ...doorItem.transom,
      height: e.target.value,
    })
  }
  disabled={readonly || !doorItem.transom?.enabled} {/* Disabled when unchecked */}
/>
```

### Pattern 2: Tab-Based Section Organization

Large forms are organized with **Tabs** for clarity:

```typescript
<Tabs defaultValue="materials" className="w-full">
  <TabsList className="grid w-full grid-cols-4">
    <TabsTrigger value="materials">Materials</TabsTrigger>
    <TabsTrigger value="labor">Labor</TabsTrigger>
    <TabsTrigger value="equipment">Equipment</TabsTrigger>
    <TabsTrigger value="summary">Summary</TabsTrigger>
  </TabsList>

  <TabsContent value="materials">
    {/* Material inputs */}
  </TabsContent>

  <TabsContent value="labor">
    {/* Labor inputs */}
  </TabsContent>

  {/* ... */}
</Tabs>
```

### Pattern 3: Read-Only Mode

Components support read-only mode (for viewing saved quotes):

```typescript
function ConcreteCalculatorForm({
  readonly = false,
  quoteData,
  setQuoteData,
}: Props) {
  return (
    <Input
      value={input.height}
      onChange={(e) => setInput({ ...input, height: parseFloat(e.target.value) })}
      disabled={readonly} {/* Disable all inputs in read-only mode */}
    />
  );
}

// Usage
<ConcreteCalculatorForm
  readonly={viewMode === "view"} // true when viewing, false when editing
  quoteData={quoteData}
  setQuoteData={setQuoteData}
/>
```

### Pattern 4: Loading States

Async operations show loading states:

```typescript
const [loading, setLoading] = useState(false);

const handleSave = async () => {
  setLoading(true);
  try {
    await supabase.from("quotes").upsert(quoteData);
    toast.success("Quote saved!");
  } catch (error) {
    toast.error("Save failed");
  } finally {
    setLoading(false);
  }
};

return (
  <Button onClick={handleSave} disabled={loading}>
    {loading ? <Loader2 className="animate-spin" /> : "Save Quote"}
  </Button>
);
```

---

## Material Pricing System

### Overview

The pricing system supports **multiple material sources**, **regional customization**, and **user overrides**:

```
Base Material Prices (Database)
         ↓
Regional Multipliers (User Setting)
         ↓
User-Specific Overrides (Custom Per-Material)
         ↓
Final Calculated Price
```

### Pricing Hierarchy

#### 1. Base Prices (Database)

**Table: `material_prices`**

```sql
CREATE TABLE material_prices (
  id UUID PRIMARY KEY,
  material_name VARCHAR,
  unit VARCHAR,
  price_kes DECIMAL,
  type JSONB,  -- Variant details (thickness, color, finish, etc.)
  category VARCHAR,
  created_at TIMESTAMP
);

-- Example row:
{
  "material_name": "Concrete",
  "unit": "m³",
  "price_kes": 15000,
  "type": {
    "grade": "C20",
    "slump": "100mm"
  },
  "category": "Concrete"
}
```

#### 2. Regional Multipliers

**Table: `regional_multipliers`**

```sql
CREATE TABLE regional_multipliers (
  id UUID PRIMARY KEY,
  region VARCHAR,
  multiplier DECIMAL,
  created_at TIMESTAMP
);

-- Example:
{
  "region": "Mombasa",
  "multiplier": 1.15  -- 15% premium for coastal region
}
```

#### 3. User Price Overrides

**Table: `user_material_prices`**

```sql
CREATE TABLE user_material_prices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  material_id UUID REFERENCES material_prices(id),
  custom_price DECIMAL,
  created_at TIMESTAMP
);
```

### Price Lookup Function

```typescript
export function getMaterialPrice(
  materialName: string,
  specificType?: string, // e.g., "20mm", "Grade C20"
  materialPrices: Material[] = [],
  userMultiplier: number = 1.0,
): number {
  // Find material and variant
  const material = materialPrices.find((m) => m.material_name === materialName);

  if (!material) {
    console.warn(`Material not found: ${materialName}`);
    return 0;
  }

  // If specific type provided, find variant
  let basePrice = material.price_kes || 0;

  if (specificType && material.type) {
    // material.type is an array of variants
    const variant = material.type.find((t) => {
      return Object.values(t).includes(specificType);
    });
    if (variant && variant.price_kes) {
      basePrice = variant.price_kes;
    }
  }

  // Apply regional multiplier
  return basePrice * userMultiplier;
}
```

### Hook for Material Prices

```typescript
export function useMaterialPrices() {
  const { profile } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [multipliers, setMultipliers] = useState<RegionalMultiplier[]>([]);
  const [loading, setLoading] = useState(true);

  const userMultiplier = useMemo(() => {
    const regionMult = multipliers.find((m) => m.region === profile?.region);
    return regionMult?.multiplier || 1.0;
  }, [multipliers, profile?.region]);

  useEffect(() => {
    Promise.all([
      supabase.from("material_prices").select("*"),
      supabase.from("regional_multipliers").select("*"),
    ])
      .then(([matsResult, multsResult]) => {
        setMaterials(matsResult.data || []);
        setMultipliers(multsResult.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    materials,
    multipliers,
    userMultiplier,
    loading,
    getPrice: (name: string, type?: string) =>
      getMaterialPrice(name, type, materials, userMultiplier),
  };
}
```

### Example: Using Material Prices in a Calculator

```typescript
function useConcreteCalculator(props: Props) {
  const { getPrice } = useMaterialPrices();
  const [concretePrice, setConcretePrice] = useState(0);

  useEffect(() => {
    // Get price for specific concrete grade
    const price = getPrice("Concrete", "C20");
    setConcretePrice(price);
  }, [getPrice]);

  // Then use in calculations
  const cost = volume * concretePrice;
  // ...
}
```

### Best Practices

1. **Always check for null** when fetching prices
2. **Cache material prices** in component state (re-fetch on profile change)
3. **Use regional multiplier** automatically from user profile
4. **Provide fallback values** if material not found
5. **Log warnings** for missing materials to catch configuration issues

---

## Quote Data Model

### Quote Structure

A quote is the central data object containing all project information:

```typescript
interface Quote {
  // Metadata
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;

  // Project Info
  project_name: string;
  client_name: string;
  client_email: string;
  project_location: string;
  start_date: string;
  end_date: string;

  // Quote Settings
  qsSettings: {
    wastageFinishes: number; // % wastage for paint/finishes
    finishingWalls: boolean; // Include finishes by default
    includePreliminary: boolean;
    preliminaryPercent: number; // Margin above materials
    contingency: number; // % buffer for unknowns
  };

  // Calculator Data (Input + Output)
  concrete_input: ConcreteInput;
  concrete_totals: ConcreteCalculation;

  masonry_walls: WallSection[];
  doors: Door[];
  windows: Window[];
  // ... other calculator data

  // Paint Specifications
  paintings_specifications: PaintingSpecification[];

  // Advanced Sections
  preliminaries_specifications: PreliminariesItem[];
  boq_lines: BOQLine[];
  equipment_selections: EquipmentSelection[];
  services_selections: ServiceSelection[];
  subcontractor_selections: SubcontractorSelection[];

  // Summary
  custom_specs: string; // User notes
  total_materials: number;
  total_labor: number;
  total_equipment: number;
  total_services: number;
  subtotal: number;
  contingency_amount: number;
  total_cost: number;
  status: "draft" | "planning" | "inquiry" | "proposed" | "accepted";

  // Export
  pdf_url?: string;
  excel_url?: string;
}
```

### Quote Lifecycle

```
1. CREATE (user starts quote)
   └─ Quote inserted to DB with initial values
      └─ Status: "draft"

2. EDIT (user modifies calculators)
   └─ Real-time updates to quoteData state
   └─ Auto-save to DB (debounced)

3. SAVE (user clicks Save)
   └─ All calculations final
   └─ Status: "planning"

4. REVIEW (user reviews before export)
   └─ All calculations locked (read-only mode)

5. EXPORT (PDF/Excel generation)
   └─ snapshot of quote data captured
   └─ PDFGenerator processes all sections

6. FINALIZE (send to client)
   └─ Status: "proposed"
   └─ Email sent
   └─ Locked from editing

7. CLIENT RESPONSE
   └─ Status: "accepted" or archived
```

### Quote Calculations Aggregation

The `useQuoteCalculations` hook aggregates all calculator outputs:

```typescript
export function useQuoteCalculations(quoteData: Quote): QuoteCalculations {
  return useMemo(() => {
    const materials = (quoteData.concrete_totals?.cost || 0) +
                      (quoteData.masonry_totals?.cost || 0) +
                      // ... sum all calculator totals

    const labor = calculateLaborCosts(quoteData); // From all sections
    const equipment = calculateEquipmentCosts(quoteData);
    const services = calculateServicesCosts(quoteData);

    const subtotal = materials + labor + equipment + services;
    const preliminaries = subtotal * (quoteData.qsSettings.preliminaryPercent / 100);
    const contingency = subtotal * (quoteData.qsSettings.contingency / 100);

    return {
      materials,
      labor,
      equipment,
      services,
      preliminaries,
      subtotal,
      contingency,
      total: subtotal + preliminaries + contingency,
    };
  }, [quoteData]);
}
```

---

## API Integration Patterns

### Supabase Integration

#### Authentication

```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { name } },
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

// OAuth
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${VITE_APP_URL}/dashboard`,
  },
});
```

#### Real-time Subscriptions

```typescript
// Subscribe to quote changes
const subscription = supabase
  .from(`quotes:user_id=eq.${userId}`)
  .on("*", (payload) => {
    console.log("Quote updated:", payload.new);
    setQuoteData(payload.new);
  })
  .subscribe();

// Cleanup
subscription.unsubscribe();
```

#### CRUD Operations

```typescript
// CREATE
await supabase.from("quotes").insert([newQuote]);

// READ
const { data } = await supabase
  .from("quotes")
  .select("*")
  .eq("user_id", userId);

// UPDATE (UPSERT pattern)
await supabase.from("quotes").upsert(updatedQuote);

// DELETE
await supabase.from("quotes").delete().eq("id", quoteId);
```

### Google Gemini API Integration

#### Plan Analysis Service

```typescript
// services/planParserService.ts
export class PlanParserService {
  async analyzePlan(imageData: string): Promise<ExtractedPlan> {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-vision",
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: imageData,
        },
      },
      {
        text: this.getAnalysisPrompt(),
      },
    ]);

    const jsonResponse = result.response.text();
    return JSON.parse(jsonResponse) as ExtractedPlan;
  }

  private getAnalysisPrompt(): string {
    return `
You are an expert architectural data extraction engine...
[prompt details for extracting walls, doors, windows, systems, etc.]
    `;
  }
}

// Usage in component
const { uploadProgress } = usePlanUpload();

const handleUpload = async (file: File) => {
  const imageData = await fileToBase64(file);
  const extracted = await planParser.analyzePlan(imageData);
  setExtractedPlan(extracted);
};
```

#### Format Safe Extraction

The Gemini service is designed to:

1. **Extract only JSON** - No markdown, no explanations
2. **Handle missing data** - Return error objects if data not found
3. **Validate structure** - Ensure extracted plan matches expected schema
4. **Retry on failure** - Implement exponential backoff

### Payment Integration (Paystack)

```typescript
// services/quotePaymentService.ts
export async function initializePaystackPayment(
  amount: number,
  email: string,
  quoteId: string,
): Promise<string> {
  const response = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount * 100, // Paystack uses cents
        email,
        metadata: { quoteId },
      }),
    },
  );

  const { data } = await response.json();
  return data.authorization_url;
}

// Verify payment
export async function verifyPaystackPayment(reference: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    },
  );

  const { data } = await response.json();
  return data.status === "success";
}
```

---

## Database Schema Deep Dive

### Core Tables

#### `profiles`

Stores user information:

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email VARCHAR,
  full_name VARCHAR,
  company_name VARCHAR,
  phone VARCHAR,
  region VARCHAR,
  avatar_url VARCHAR,
  tier VARCHAR DEFAULT 'free', -- free, professional, premium
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `quotes`

Main quote document:

```sql
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  project_name VARCHAR,
  client_name VARCHAR,
  client_email VARCHAR,
  project_location VARCHAR,

  -- Calculator data (JSONB for flexibility)
  concrete_input JSONB,
  concrete_totals JSONB,
  masonry_walls JSONB,
  doors JSONB,
  windows JSONB,
  paintings_specifications JSONB,

  -- Settings
  qs_settings JSONB,

  -- Totals
  total_cost DECIMAL,
  status VARCHAR DEFAULT 'draft',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX (user_id),
  INDEX (status),
  INDEX (created_at DESC)
);
```

**Why JSONB?**

- Flexible schema - calculators can add fields without migrations
- Efficient queries - can filter by nested fields
- Versioning - old quotes don't break with schema changes

#### `material_prices`

```sql
CREATE TABLE material_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_name VARCHAR NOT NULL,
  unit VARCHAR,
  price_kes DECIMAL NOT NULL,
  category VARCHAR,
  type JSONB, -- Array of variants with prices
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(material_name, unit)
);

-- Example type structure:
{
  "variants": [
    {
      "name": "20mm",
      "grade": "Standard",
      "price_kes": 500
    },
    {
      "name": "25mm",
      "grade": "Premium",
      "price_kes": 600
    }
  ]
}
```

#### `subscriptions`

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  plan VARCHAR NOT NULL, -- free, professional, premium
  amount DECIMAL,
  status VARCHAR DEFAULT 'active', -- active, cancelled, expired
  subscription_code VARCHAR UNIQUE,
  authorization_code VARCHAR,
  next_billing_date DATE,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX (user_id),
  INDEX (status)
);
```

#### `quote_events`

Audit log of quote changes:

```sql
CREATE TABLE quote_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  event_type VARCHAR, -- created, updated, exported, deleted
  changes JSONB, -- What changed
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX (quote_id),
  INDEX (created_at DESC)
);
```

### Relationship Diagram

```
profiles
  ├─ quotes (one-to-many)
  │   ├─ quote_events (one-to-many)
  │   └─ quote_exports (one-to-many)
  │
  ├─ subscriptions (one-to-many)
  │
  ├─ user_material_prices (one-to-many override pricing)
  │   └─ material_prices (many-to-one)
  │
  └─ user_settings (one-to-one)

material_prices
  ├─ user_material_prices (one-to-many user overrides)
  └─ regional_multipliers (many-to-one by region)
```

### Common Queries

```typescript
// Get user's quotes with selections
const { data: quotes } = await supabase
  .from("quotes")
  .select("*, quote_events(*)")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });

// Get quote details with all relations
const { data: quote } = await supabase
  .from("quotes")
  .select(
    `
    *,
    user_id,
    quote_events(*)
  `,
  )
  .eq("id", quoteId)
  .single();

// Upsert quote (create or update)
const { data, error } = await supabase.from("quotes").upsert(quoteData, {
  onConflict: "id",
});

// Get active subscriptions
const { data: subs } = await supabase
  .from("subscriptions")
  .select("*")
  .eq("user_id", userId)
  .eq("status", "active");
```

---

## Performance Optimization

### Calculation Performance

#### Memoization Pattern

```typescript
const calculations = useMemo(() => {
  // Expensive calculations only run when dependencies change
  return calculateComplex(input, materialPrices);
}, [input, materialPrices]);
```

#### Large List Rendering

```typescript
// Don't render 1000 items, use virtualization
import { FixedSizeList } from "react-window";

<FixedSizeList
  height={600}
  itemCount={items.length}
  itemSize={50}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      {items[index].name}
    </div>
  )}
</FixedSizeList>
```

### Network Performance

#### Lazy Loading Resources

```typescript
// Load material prices only when needed
const MasonryCalculator = lazy(() =>
  import("./MasonryCalculator").then((m) => ({
    default: m.MasonryCalculator,
  }))
);

<Suspense fallback={<Skeleton />}>
  <MasonryCalculator />
</Suspense>
```

#### Debouncing Saves

```typescript
const debouncedSave = useCallback(
  debounce(async (data: Quote) => {
    await supabase.from("quotes").upsert(data);
  }, 2000),
  [],
);

useEffect(() => {
  debouncedSave(quoteData);
}, [quoteData]);
```

### Bundle Size

```bash
# Analyze bundle
npm run build
npm install -g vite-plugin-visualizer
# Review dist/stats.html
```

Exclude heavy dependencies from bundle:

```typescript
// Use dynamic imports
const PDFGenerator = lazy(() => import("./PDFGenerator"));
```

---

## Error Handling Strategy

### Global Error Boundary

```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Boundary caught:", error, errorInfo);
    logToSentry(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="p-6 m-4">
          <h2>Something went wrong</h2>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}
```

**Wrap App:**

```typescript
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### Service-Level Error Handling

```typescript
async function saveQuote(quoteData: Quote) {
  try {
    const { data, error } = await supabase.from("quotes").upsert(quoteData);

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    toast.success("Quote saved successfully!");
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Save failed:", message);
    toast.error(`Failed to save: ${message}`);
    throw error; // Re-throw for caller to handle
  }
}
```

### Validation Errors

```typescript
import { z } from "zod";

const quoteSchema = z.object({
  projectName: z.string().min(3, "Name too short"),
  clientEmail: z.string().email("Invalid email"),
  totalCost: z.number().positive("Cost must be positive"),
});

function validateQuote(data: unknown) {
  try {
    return quoteSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        toast.error(`${err.path.join(".")}: ${err.message}`);
      });
    }
    return null;
  }
}
```

---

## Testing Approach

### Unit Tests for Calculations

```typescript
// __tests__/calculations/concrete.test.ts
import { calculateConcreteVolume } from "@/utils/concreteCalculations";

describe("Concrete Calculator", () => {
  test("calculates rectangular volume correctly", () => {
    const result = calculateConcreteVolume({
      shape: "rectangular",
      length: 10,
      width: 10,
      height: 2,
      wastagePercent: 5,
      unitPrice: 100,
    });

    expect(result.volume).toBe(200);
    expect(result.totalVolumWithWastage).toBe(210);
  });

  test("handles circular volumes", () => {
    const result = calculateConcreteVolume({
      shape: "circular",
      diameter: 4,
      height: 2,
      wastagePercent: 10,
      unitPrice: 100,
    });

    expect(result.volume).toBeCloseTo(Math.PI * 4 * 2, 2);
  });
});
```

### Hook Tests

```typescript
// __tests__/hooks/useConcreteCalculator.test.ts
import { renderHook, act } from "@testing-library/react";
import { useConcreteCalculator } from "@/hooks/useConcreteCalculator";

describe("useConcreteCalculator", () => {
  test("updates calculations on input change", () => {
    const { result } = renderHook(() =>
      useConcreteCalculator({
        initialData: { shape: "rectangular", ... },
      })
    );

    act(() => {
      result.current.setInput({
        ...result.current.input,
        height: 3,
      });
    });

    expect(result.current.calculations?.volume).toBe(300);
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/quoteCreation.test.ts
test("create quote with concrete calculator", async () => {
  const { user, profile } = await loginUser();
  const quote = await createQuote(user.id, {
    projectName: "Test Project",
  });

  // Add concrete calculation
  const updated = await updateQuote(quote.id, {
    concrete_input: { shape: "rectangular", ... },
  });

  expect(updated.concrete_totals.costKES).toBeGreaterThan(0);
});
```

---

## Development Best Practices

### Code Organization

```
src/
├── components/          # React components (organized by domain)
│   ├── calculators/    # Calculator UI components
│   ├── builders/       # Quote/BOQ builder components
│   ├── ui/            # shadcn base components
│   └── sections/      # Page sections
│
├── hooks/              # Custom React hooks (organized by domain)
│   ├── calculators/   # Calculator hooks (or at root)
│   └── data/         # Data fetching hooks
│
├── pages/              # Route pages
│   └── auth/
│
├── services/           # External integrations
│
├── contexts/           # React contexts (globals)
│
├── types/              # TypeScript interfaces
│   └── [domain].ts    # Organized by domain
│
├── utils/              # Helper functions
│   ├── calculations/   # Domain-specific math functions
│   └── formatting.ts   # String/number formatting
│
└── integrations/       # Third-party SDK setup
    └── supabase/
```

### Naming Conventions

| Artifact    | Convention            | Example                                |
| ----------- | --------------------- | -------------------------------------- |
| Components  | PascalCase            | `ConcreteCalculatorForm`               |
| Hooks       | `use*` prefix         | `useConcreteCalculator`                |
| Types       | PascalCase            | `ConcreteInput`, `ConcreteCalculation` |
| Utilities   | camelCase             | `calculateConcreteVolume`              |
| Constants   | UPPER_SNAKE_CASE      | `DEFAULT_WASTAGE_PERCENT`              |
| CSS Classes | kebab-case (Tailwind) | `text-gray-900 dark:text-white`        |

### TypeScript Best Practices

```typescript
// ✅ Good: Explicit types
interface Props {
  quoteData: Quote;
  setQuoteData: (quote: Quote) => void;
}

// ❌ Bad: Implicit `any`
function handleUpdate(data) {
  // What type is data?
  const updated = { ...data };
}

// ✅ Good: Use discriminated unions
type Status = "draft" | "planning" | "proposed";

// ✅ Good: Use Omit/Pick for derived types
type QuoteUpdate = Omit<Quote, "id" | "created_at">;
```

### Commit Message Format

```
feat: Add transom checkbox to door editor
fix: Resolve infinite loop in usePaintingCalculator
docs: Update README with calculator docs
refactor: Extract material pricing logic
test: Add tests for concrete calculator
```

---

## How-To Guides

### Add a New Calculator

Follow these 5 steps to add a new domain calculator:

#### Step 1: Define Types

Create `src/types/newdomain.ts`:

```typescript
export interface NewDomainInput {
  // Form inputs
  length: number;
  width: number;
  // ... other inputs
}

export interface NewDomainCalculation {
  // Results
  totalVolume: number;
  totalCost: number;
  // ... other outputs
}

export const DEFAULT_NEW_DOMAIN_INPUT: NewDomainInput = {
  length: 0,
  width: 0,
};
```

#### Step 2: Create Calculation Functions

Create `src/utils/newdomainCalculations.ts`:

```typescript
export function calculateNewDomain(
  input: NewDomainInput,
  unitPrice: number,
): NewDomainCalculation {
  const volume = input.length * input.width;
  const cost = volume * unitPrice;

  return {
    totalVolume: volume,
    totalCost: cost,
  };
}
```

#### Step 3: Create Hook

Create `src/hooks/useNewDomainCalculator.ts`:

```typescript
export function useNewDomainCalculator({
  initialData,
  materialPrices = [],
  onCalculationsChange,
}: Props) {
  const [input, setInput] = useState(initialData || DEFAULT_NEW_DOMAIN_INPUT);
  const [calculations, setCalculations] =
    useState<NewDomainCalculation | null>();
  const [unitPrice, setUnitPrice] = useState(0);

  // Fetch material price
  useEffect(() => {
    const price = getMaterialPrice("NewMaterial", undefined, materialPrices);
    setUnitPrice(price);
  }, [materialPrices]);

  // Calculate
  useEffect(() => {
    const result = calculateNewDomain(input, unitPrice);
    setCalculations(result);
  }, [input, unitPrice]);

  // Propagate
  useEffect(() => {
    if (onCalculationsChange && calculations) {
      onCalculationsChange(calculations);
    }
  }, [calculations]);

  return { input, setInput, calculations };
}
```

#### Step 4: Create Component

Create `src/components/NewDomainCalculator.tsx`:

```typescript
export function NewDomainCalculator({
  quoteData,
  setQuoteData,
  materialPrices,
  readonly = false,
}: Props) {
  const { input, setInput, calculations } = useNewDomainCalculator({
    initialData: quoteData.newdomain_input,
    materialPrices,
    onCalculationsChange: (calcs) => {
      setQuoteData((prev) => ({
        ...prev,
        newdomain_totals: calcs,
      }));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Domain Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Length (m)</Label>
          <Input
            type="number"
            value={input.length}
            onChange={(e) =>
              setInput({ ...input, length: parseFloat(e.target.value) })
            }
            disabled={readonly}
          />
        </div>

        {calculations && (
          <div className="p-4 bg-gray-50 rounded">
            <p>Total Cost: KES {calculations.totalCost.toLocaleString()}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

#### Step 5: Integrate into Quote Builder

In `components/QuoteBuilder.tsx`:

```typescript
<TabsContent value="newdomain">
  <NewDomainCalculator
    quoteData={quoteData}
    setQuoteData={setQuoteData}
    materialPrices={materialPrices}
    readonly={viewMode === "view"}
  />
</TabsContent>
```

### Add a Checkbox-Based Optional Feature

Example: Add "Include XYZ" checkbox to existing calculator

#### 1. Add State

```typescript
const [includeFeature, setIncludeFeature] = useState<boolean>(
  // Smart initialization: check if feature data exists
  (quoteData?.feature_data?.length || 0) > 0,
);
```

#### 2. Add Checkbox

```typescript
<div className="border-t pt-4">
  <div className="flex items-center gap-2">
    <Checkbox
      id="include-feature"
      checked={includeFeature}
      onCheckedChange={setIncludeFeature}
      disabled={readonly}
    />
    <Label htmlFor="include-feature">Include Feature</Label>
  </div>

  {includeFeature && <FeatureCard {...props} />}
</div>
```

#### 3. Disable Inputs When Unchecked

```typescript
<Input
  value={featureData.value}
  onChange={handleChange}
  disabled={readonly || !includeFeature} {/* Add this */}
/>
```

### Migrate from Radio to Checkbox

When changing from RadioGroup mode switching to checkbox-based optional features:

#### Before (Radio):

```typescript
const [mode, setMode] = useState("basic");

<RadioGroup value={mode} onValueChange={setMode}>
  <RadioGroupItem value="basic" />
  <RadioGroupItem value="advanced" />
</RadioGroup>

{mode === "basic" && <BasicSection />}
{mode === "advanced" && <AdvancedSection />}
```

#### After (Checkbox):

```typescript
const [includeAdvanced, setIncludeAdvanced] = useState(false);

<Checkbox
  checked={includeAdvanced}
  onCheckedChange={setIncludeAdvanced}
/>

{/* Basic section always visible */}
<BasicSection />

{/* Advanced section optional */}
{includeAdvanced && <AdvancedSection />}
```

**Benefits:**

- Users can include both basic AND advanced (not mutually exclusive)
- Better UX for additive features
- Simpler state management (boolean vs enum)

---

## Troubleshooting

### Common Issues

#### Issue: Infinite Loop in useEffect

**Symptoms:** "Maximum update depth exceeded"

**Solution:**

```typescript
// ❌ Bad: callback in dependencies
useEffect(() => {
  onCalcsChange(calculations);
}, [calculations, onCalcsChange]); // Callback = infinite loop

// ✅ Good: wrap callback in useCallback at call site
const memoCallback = useCallback(
  (calcs) => setData((prev) => ({ ...prev, calcs })),
  [],
);
useHook({ onCalcsChange: memoCallback });

// ✅ In hook: don't include callback in dependencies
useEffect(() => {
  if (onCalcsChange) onCalcsChange(calculations);
}, [calculations]); // Only calculations
```

#### Issue: Stale Prices in Calculator

**Symptoms:** Calculator shows old prices even after updating material prices

**Solution:**

```typescript
// Ensure prices are in useEffect dependencies:
useEffect(() => {
  const cost = calculateCost(input, priceMap);
  setCalculations(cost);
}, [input, priceMap]); // ✅ Include priceMap
```

#### Issue: Quote Not Saving

**Symptoms:** Data changes but not persisted to Supabase

**Debug checklist:**

1. Check network tab - is request being sent?
2. Check Supabase auth - is user authenticated?
3. Check Row Level Security (RLS) policies
4. Check `updated_at` timestamp - changed?
5. Look for console errors

```typescript
try {
  const { error } = await supabase.from("quotes").upsert(quoteData);
  if (error) {
    console.error("Supabase error:", error.message); // Details here
  }
} catch (e) {
  console.error("Network error:", e);
}
```

#### Issue: Material Prices Always Zero

**Symptoms:** Calculations show zero cost

**Debug:**

```typescript
// Check if materials loaded
useEffect(() => {
  console.log("Material prices:", materials);
  // Should see array of materials

  const price = getMaterialPrice("Concrete", undefined, materials);
  console.log("Concrete price:", price); // Should not be 0
}, [materials]);
```

#### Issue: PDF Export Failed

**Symptoms:** "Export failed" toast notification

**Check:**

1. Is quote data complete? (all required fields)
2. Are there calculation errors? (look at console)
3. Is PDF generation library loaded?
4. Are images/fonts available?

```typescript
try {
  const pdf = await generateQuotePDF(quoteData);
  // Success
} catch (error) {
  console.error("PDF error:", error);
  // Detailed error message from catch block
}
```

### Performance Issues

#### Slow Calculator Rendering

**Check:**

```typescript
// Use React DevTools Profiler
// 1. Record a session
// 2. Look for prolonged renders
// 3. Check which component re-renders

// Common cause: object props causing re-renders
// Solution: useMemo for derived objects
const config = useMemo(() => ({ a, b, c }), [a, b, c]);
```

#### Laggy Quote Builder

**Optimize:**

```typescript
// 1. Use Suspense for lazy calculator loading
<Suspense fallback={<Skeleton />}>
  <HeavyCalculator />
</Suspense>

// 2. Debounce input changes
const debouncedInput = useMemo(
  () => debounce((val) => setInput(val), 300),
  []
);

// 3. Virtualize long lists
<FixedSizeList itemCount={items.length}>
  {renderItem}
</FixedSizeList>
```

### Database Issues

#### RLS Policy Denied

**Error:** "new row violates row level security policy"

**Check RLS policies:**

```sql
-- User can only see their own quotes
CREATE POLICY "Users see own quotes" ON quotes
  FOR SELECT USING (auth.uid() = user_id);

-- User can update their own quotes
CREATE POLICY "Users update own quotes" ON quotes
  FOR UPDATE USING (auth.uid() = user_id);
```

---

## Appendix: Environment Variables

Create `.env` in project root:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Paystack (public key only - secret key is configured server-side)
VITE_PAYSTACK_KEY=pk_live_...

# App URLs
VITE_APP_URL=https://constructly-ai.com
VITE_API_URL=https://api.constructly-ai.com

# Server-side only (set in Netlify environment, not in .env)
# GEMINI_API_KEY=your_gemini_key
# PAYSTACK_SECRET_KEY=your_paystack_secret
```

## Appendix: Useful Commands

```bash
# Development
npm run dev                # Start dev server
npm run build             # Production build
npm run preview           # Preview build locally

# Linting & Formatting
npm run lint              # Run ESLint
npm run format            # Format code with Prettier

# Testing
npm test                  # Run tests
npm run test:coverage    # Coverage report

# Type Checking
npx tsc --noEmit         # Check types without emitting

# Database
npm run db:migrations    # Run Supabase migrations
npm run db:push         # Push schema changes
```

---

**Last Updated:** February 2026  
**Version:** 2.1.0

For questions or clarifications, please refer to the code comments and inline documentation.
