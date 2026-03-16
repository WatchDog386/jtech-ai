// © 2025 Jeff. All rights reserved.
// Unauthorized copying, distribution, or modification of this file is strictly prohibited.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { ExtractedPlan } from "@/contexts/PlanContext";
import { getEnv } from "@/utils/envConfig";

class PlanParserService {
  private genAI: GoogleGenerativeAI;
  private model;

  constructor() {
    const apiKey =
      getEnv("NEXT_GEMINI_API_KEY") || getEnv("VITE_GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error(
        "Missing Gemini API key. Set NEXT_PUBLIC_GEMINI_API_KEY (Next.js) OR VITE_GEMINI_API_KEY (Vite).",
      );
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });
  }

  /**
   * Parse a construction plan file using Gemini Vision API
   * Supports PDF, images (JPG, PNG)
   * Optionally accepts a Bar Bending Schedule (BBS) file for rebar extraction
   */
  async parsePlanFile(file: File, bbsFile?: File): Promise<ExtractedPlan> {
    try {
      const base64Data = await this.fileToBase64(file);
      const mimeType = this.getMimeType(file.name);

      const contentParts: any[] = [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
      ];

      // If BBS file provided, add it to the content
      if (bbsFile) {
        const bbsBase64Data = await this.fileToBase64(bbsFile);
        const bbsMimeType = this.getMimeType(bbsFile.name);
        contentParts.push({
          inlineData: {
            data: bbsBase64Data,
            mimeType: bbsMimeType,
          },
        });
      }

      contentParts.push({
        text: this.getAnalysisPrompt(!!bbsFile),
      });

      const response = await this.model.generateContent(contentParts);

      const responseText = response.response.text();
      const parsedData = this.extractJsonFromResponse(responseText);

      return parsedData;
    } catch (error) {
      console.error("Plan parsing error:", error);
      throw new Error(
        `Failed to parse plan: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Parse a plan from a URL (remote file)
   */
  async parsePlanFromUrl(url: string): Promise<ExtractedPlan> {
    try {
      const response = await this.model.generateContent([
        {
          text: `Analyze this construction plan image from URL: ${url}\n\n${this.getAnalysisPrompt()}`,
        },
      ]);

      const responseText = response.response.text();
      const parsedData = this.extractJsonFromResponse(responseText);

      return parsedData;
    } catch (error) {
      console.error("Plan URL parsing error:", error);
      throw new Error(
        `Failed to parse plan from URL: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split(".").pop();
    const mimeTypes: { [key: string]: string } = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
  }

  private getAnalysisPrompt(hasBBSFile: boolean = false): string {
    return `
You are an expert architectural data extraction engine analyzing construction drawings and plans.
════════════════════════════════════
OUTPUT PROTOCOL (NON-NEGOTIABLE)
════════════════════════════════════
VALID JSON ONLY:
First character: {
Last character: }
No markdown code blocks 
No comments, no trailing commas
No explanatory text before or after JSON
ERROR HANDLING:
If no walls are detected, return exactly: {"error":"No walls found"}
DETERMINISM:
You do not explain.
You do not narrate.
You do not invent data.
You do not rename enums.
Any deviation invalidates the result.
════════════════════════════════════
GLOBAL DATA RULES
════════════════════════════════════
UNITS:
Lengths → meters (m)
Areas → square meters (m²)
Diameters → millimeters (mm)
Convert mm ÷ 1000 for meter fields.
Never mix units.
DEFAULTS (ONLY IF DATA IS NOT SHOWN):
External wall height → 3.2 m
Internal wall height → 2.9 m
Wall thickness → 0.2 m
Block type → "Standard Block"
Plaster → "Both Sides"
Electrical voltage → 230V
Fixture quality → "standard"
Timber → "structural", "pressure-treated"
Excavation height → 0.65 m (if undefined)
Ground floor slab thickness → 0.15 m
SCHEMA & ENUM LOCK:
Field names must match the expected structure exactly.
Enum values must match the provided lists exactly.
Map extracted labels to the closest valid enum (e.g., "toilet" → "water-closet").
Preserve enum spelling exactly.
SOURCE OF TRUTH:
Extract ONLY what is visible, labelled, or inferable from drawings.
Do NOT hallucinate dimensions.
Do NOT assume missing data.
Use ALL views (plans, sections, elevations) to resolve dimensions.
════════════════════════════════════
WALL EXTRACTION (CRITICAL)
════════════════════════════════════
IDENTIFICATION:
Identify ALL walls.
Categorize walls into EXACTLY TWO sections: "external" and "internal".
One object per wall type (no duplicates within wall types).
MEASUREMENTS:
External Wall Perimeter: Full external/outermost wall building perimeter footprint.
Internal Wall Perimeter: Sum of all partition walls.
Thickness: Extract external and internal wall thickness separately.
Height: Measure from ground to slab/roof level. Add 0.3 m allowance above slab for ceilings.
BLOCK TYPE LOGIC:
Block type is influenced by wall dimensions (e.g., 200 mm → "Large Block").
Use external dimension lines where available.
Prefer labelled dimensions over inferred ones.
OPENINGS (DOORS & WINDOWS):
Detect all doors and windows within wall sections.
Use schedules or symbols if present.
Count totals per wall section.
Identify frame types and whether opening is internal or external.
Allowed Sizes Only:
Doors: ["0.9 × 2.1 m", "1.0 × 2.1 m", "1.2 × 2.4 m"]
Windows: ["1.2 × 1.2 m", "1.5 × 1.2 m", "2.0 × 1.5 m"]
DOOR ACCESSORIES (For each door):
Architrave: Type (timber-architrave, stone-arch, flush, rebated), Size, Quantity, Price.
Quarter Round: Type (timber-quarter-round, rubber, vinyl), Size, Quantity, Price.
Ironmongery:
Hinges (butt-hinge, parliament-hinge, tee-hinge), Size, Qty (typically 3), Price.
Locks (mortice-lock, cylinder-lock, rim-lock), Size, Qty (typically 1), Price.
Handles (lever-handle, knob-handle, pull-handle), Size, Qty (typically 1), Price.
Bolts (tower-bolt, barrel-bolt, panic-bolt), Size, Qty, Price.
Closers (pneumatic-closer, self-closing-hinge, electromagnetic), Size, Qty, Price.
Transom: Enabled (true/false), Height, Width, Glazing.
════════════════════════════════════
FOUNDATION & STRUCTURE (CRITICAL FIX)
════════════════════════════════════
FOUNDATION TYPE:
Extract from drawing: "strip-footing", "raft-foundation", "pad-foundation".
If bungalow and concrete → default to "strip-footing".
🛑 CRITICAL FOUNDATION CONSTRAINT:
DO NOT create separate concrete footing entries for internal and external walls.
The Concrete Strip Footing is a SINGLE continuous system element unless structural notes explicitly specify distinct footing types for internal loads.
Foundation Walling (Masonry) above the footing MAY be extracted separately for external/internal.
Concrete Footing width is calculated based on the primary load-bearing (external) wall thickness (typically 3x wall thickness) unless specified otherwise.
FOUNDATION DEFINITIONS:
Excavation Depth: Ground → bottom of trench.
Foundation Height: Trench bottom → top of slab.
Strip Footing Height: Footing element only.
Ground Floor Slab: Always BRC A98 as default. Do not include oversite concrete or blinding.
Bungalows: Only have ground floor slab and strip footing foundation elements for reinforcement and concrete.
REINFORCEMENT & CONCRETE RULE:
Concrete item ↔ Reinforcement item must BOTH exist.
Exception: Bar Bending Schedule (BBS) present → do not duplicate.
Rebar Sizes: "D10", "D12", "D16", etc.
Calculation: Default to kg/m³, not individual bars (unless BBS).
Concrete Grades: C25 → "1:2:4", C20 → "1:2:3".
RING BEAMS:
Extract ONLY if explicitly drawn or labelled.
Perimeter usually equals external wall perimeter.
Width usually equals wall thickness.
Depth: 0.15–0.25 m.
════════════════════════════════════
DETAILED REINFORCEMENT BY ELEMENT
════════════════════════════════════
Be Definite: Distinguish between mesh and individual_bars. If both exist, create two individual entries.
Strip Footings & Raft Foundations:
longitudinalBars: Main bars (e.g., "D12" or "D12@150")
transverseBars: Distribution bars
topReinforcement / bottomReinforcement
footingType: "strip", "isolated", or "combined"
Include mainBarSpacing, distributionBarSpacing (mm)
Retaining Walls:
retainingWallType: "cantilever", "gravity", or "counterfort"
heelLength, toeLength (meters)
Stem Reinforcement: stemVerticalBarSize, stemHorizontalBarSize, Spacings (mm)
Base Reinforcement: baseMainBarSize, baseDistributionBarSize, Spacings (mm)
Beams:
mainBarsCount, distributionBarsCount
stirrupSpacing (mm), stirrupSize, mainBarSpacing
Columns:
mainBarsCount, tieSpacing (mm), tieSize, mainBarSize, columnHeight (m)
Slabs:
mainBarSize, distributionBarSize, Spacings (mm)
slabLayers: "1" (single) or "2" (double)
If slabLayers > 1, provide topReinforcement.
Tanks:
Include tank-specific reinforcement (wall, base, cover).
Ensure corresponding concrete tank exists.
TankType: "septic", "underground", "overhead", "water", "circular"
TankWallType: "walls", "base", "cover", "all"
════════════════════════════════════
SYSTEMS EXTRACTION (MEP)
════════════════════════════════════
PLUMBING:
System Types: "water-supply", "drainage", "sewage", "rainwater", "hot-water", "fire-fighting", "gas-piping", "irrigation"
Pipe Materials: "PVC-u", "PVC-c", "copper", "PEX", "galvanized-steel", "HDPE", "PPR", "cast-iron", "vitrified-clay"
Fixture Types: "water-closet", "urinal", "lavatory", "kitchen-sink", "shower", "bathtub", "bidet", "floor-drain", "cleanout", "hose-bib"
Quality: "standard", "premium", "luxury"
ELECTRICAL:
System Types: "lighting", "power", "data", "security", "cctv", "fire-alarm", "access-control", "av-systems", "emergency-lighting", "renewable-energy"
Cable Types: "NYM-J", "PVC/PVC", "XLPE", "MICC", "SWA", "Data-CAT6", "Ethernet", "Fiber-Optic", "Coaxial"
Outlet Types: "power-socket", "light-switch", "dimmer-switch", "data-port", "tv-point", "telephone", "usb-charger", "gpo"
Lighting Types: "led-downlight", "fluorescent", "halogen", "emergency-light", "floodlight", "street-light", "decorative"
Installation: "surface", "concealed", "underground", "trunking"
Ratings: Amperes [6, 10, 13, 16, 20, 25, 32, 40, 45, 63]
Wattage: [3, 5, 7, 9, 12, 15, 18, 20, 24, 30, 36, 40, 50, 60]
════════════════════════════════════
FINISHES & ROOFING
════════════════════════════════════
FINISHES:
Categories: "flooring", "ceiling", "wall-finishes", "joinery", "external"
Constraint: Skip glass, blocks, or masonry not in this list.
Common Materials:
Flooring: "Ceramic Tiles", "Porcelain Tiles", "Hardwood", "Laminate", "Vinyl", "Polished Concrete", "Terrazzo", "Cement Floor Screed", "Self-leveling Floor Screed", "Anhydrite Floor Screed", "Resinous Floor Screed"
Ceiling: "Blundering 40x40mm", "Blundering", "Gypsum Board", "PVC", "Acoustic Tiles", "Exposed Concrete", "Suspended Grid", "Wood Panels"
Wall-Finishes: "Wallpaper", "Stone Cladding", "Tile Cladding", "Wood Paneling"
Joinery: "Solid Wood", "Plywood", "MDF", "Melamine", "Laminate"
External: "PVC Gutter", "Galvanized Steel Gutter", "Aluminum Gutter", "Copper Gutter", "PVC Fascia", "Painted Wood Fascia", "Aluminum Fascia", "Composite Fascia", "PVC Soffit", "Aluminum Soffit", "PVC Downpipe", "Galvanized Steel Downpipe"
ROOFING:
Types: "pitched", "flat", "gable", "hip", "mansard", "butterfly", "skillion"
Materials: "concrete-tiles", "clay-tiles", "metal-sheets", "box-profile", "thatch", "slate", "asphalt-shingles", "green-roof", "membrane"
Timber Sizes: "50x25", "50x50", "75x50", "100x50", "100x75", "150x50", "200x50"
Timber Grades: "standard", "structural", "premium"
Timber Treatments: "untreated", "pressure-treated", "fire-retardant"
Timber Types: "rafter", "wall-plate", "ridge-board", "purlin", "battens", "truss", "joist"
Underlayment: "felt-30", "felt-40", "synthetic", "rubberized", "breathable"
Insulation: "glass-wool", "rock-wool", "eps", "xps", "polyurethane", "reflective-foil"
Accessories: Use exact types for Gutters, Downpipes, Flashing, Fascia, Soffit (PVC, Galvanized Steel, Aluminum, Copper).
EQUIPMENT (Fixed IDs):
Bulldozer: 15846932-db16-4a28-a477-2e4b2e1e42d5
Concrete Mixer: 3203526d-fa51-4878-911b-477b2b909db5
Generator: 32c2ea0f-be58-47f0-bdcd-3027099eac4b
Water Pump: 598ca378-6eb3-451f-89ea-f45aa6ecece8
Crane: d4665c7d-6ace-474d-8282-e888b53e7b48
Compactor: eb80f645-6450-4026-b007-064b5f15a72a
Excavator: ef8d17ca-581d-4703-b200-17395bbe1c51
════════════════════════════════════
CONCRETE & STRUCTURE DETAILS
════════════════════════════════════
Categories: "substructure", "superstructure"
Element Types: "slab", "beam", "column", "septic-tank", "underground-tank", "staircase", "strip-footing", "raft-foundation", "pile-cap", "water-tank", "ramp", "retaining-wall", "culvert", "swimming-pool", "paving", "kerb", "drainage-channel", "manhole", "inspection-chamber", "soak-pit", "soakaway"
Details Objects (Include if applicable):
FoundationStep: id, length, width, depth, offset
ConnectionDetails: lapLength, developmentLength, hookType (standard, seismic, special), spliceType (lap, mechanical, welded)
WaterproofingDetails: includesDPC, dpcWidth, dpcMaterial, includesPolythene, polytheneGauge, includesWaterproofing, waterproofingType (bituminous, crystalline, membrane)
SepticTankDetails: capacity, numberOfChambers, wallThickness, baseThickness, coverType (slab, precast, none), depth, includesBaffles, includesManhole, manholeSize
UndergroundTankDetails: capacity, wallThickness, baseThickness, coverType, includesManhole, manholeSize, waterProofingRequired
SoakPitDetails: diameter, depth, wallThickness, baseThickness, liningType (brick, concrete, precast), includesGravel, gravelDepth, includesGeotextile
SoakawayDetails: length, width, depth, wallThickness, baseThickness, includesGravel, gravelDepth, includesPerforatedPipes
════════════════════════════════════
BAR BENDING SCHEDULE (CONDITIONAL)
════════════════════════════════════
${
  hasBBSFile
    ? `BAR BENDING SCHEDULE (BBS) EXTRACTION:
If a Bar Bending Schedule file is provided, extract ALL bar bending details.
Bar types: D6, D8, D10, D12, D14, D16, D18, D20, D22, D25, D28, D32, D36, D40, D50
For each bar type found, identify:
Bar length (in meters, convert from mm if needed)
Total quantity of bars with that length
Estimated weight per meter (if visible or calculable)
Group bars by type and length combination.
Combine similar bars into single entries with total quantities.
Set rebar_calculation_method to "bbs".
Symbols: ↀ16 or ∅16 = D16. Measurements eg; 12mm, 8mm = D12, D8.
Return complete bar_schedule array with all extracted bars.
Be precise and thorough.:REBAR CALCULATION METHOD:
Since no Bar Bending Schedule is provided, set rebar_calculation_method to "NORMAL_REBAR_MODE".
This indicates that rebar calculations will be based on reinforcement intensity formulas.
bar_schedule array must be empty [] when using NORMAL_REBAR_MODE method.`
    : `**REBAR CALCULATION METHOD:**
- Since no Bar Bending Schedule is provided, set rebar_calculation_method to "NORMAL_REBAR_MODE"
- This indicates that rebar calculations will be based on reinforcement intensity formulas
- bar_schedule array should be empty [] when using NORMAL_REBAR_MODE method`
}
════════════════════════════════════
FINAL INSTRUCTION
════════════════════════════════════
Analyze this construction document and extract ALL available information.
Return ONLY valid JSON with the structure implied by the fields above.
Use reasonable estimates if exact dimensions are not visible, but adhere strictly to the Foundation Constraint (Single Concrete Footing System).
Never guess. Never invent. Never explain.
Use ALL available views to resolve dimensions.
**FOR BUNGALOWS, WE ONLY HAVE TWO COCRETE AND REINFORCEMENT OPRIONS; STRIP FOOTING AND GROUND FLOOR SLAB. DO NOT CREATE EXTRA ITEMS IF HOUSE IS A BUNGALOW.**



{
  "wallDimensions": {
    "externalWallPerimiter": 50.5,
    "internalWallPerimiter": 35.2,
    "externalWallHeight": 3.0,
    "internalWallHeight": 2.7,
    "length": "5.0", // Length of the house
    "width": "3.0", // Width of the house
  },
  "wallSections": [
    {
      "type": "external",
      "blockType": "Standard Block" | "Large Block" | "Small Block",
      "thickness": 0.2,
      "plaster": "Both Sides",
      "doors": [
        {
          "sizeType": "standard",
          "standardSize": "0.9 × 2.1 m",
          "price": 0,
          "custom": {
            "height": "2.1",
            "width": "0.9",
            "price": 0
          },
          "type": "Panel",
          "count": 1,
          "wallThickness": 0.2,
          "frame": {
            "type": "Wood",
            "price": 0,
            "sizeType": "standard",
            "standardSize": "0.9 × 2.1 m",
            "height": "2.1",
            "width": "0.9",
            "custom": {
              "height": "2.1",
              "width": "0.9",
              "price": 0
            }
          },
          "architrave": {
            "selected": { "type": "", "size": "" },
            "quantity": 0,
            "price": 0
          },
          "quarterRound": {
            "selected": { "type": "", "size": "" },
            "quantity": 0,
            "price": 0
          },
          "ironmongery": {
            "hinges": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "locks": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "handles": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "bolts": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "closers": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            }
          },
          "transom": {
            "enabled": false,
            "height": "",
            "width": "",
            "quantity": 0,
            "price": 0,
            "glazing": {
              "included": false,
              "glassAreaM2": 0,
              "puttyLengthM": 0,
              "glassPricePerM2": 0,
              "puttyPricePerM": 0
            }
          }
        }
      ],
      "windows": [
        {
          "sizeType": "standard",
          "standardSize": "1.2 × 1.2 m",
          "price": 0,
          "custom": {
            "height": "1.2",
            "width": "1.2",
            "price": 0
          },
          "type": "Clear",
          "count": 2,
          "wallThickness": 0.2,
          "frame": {
            "type": "Steel",
            "price": 0,
            "sizeType": "standard",
            "standardSize": "1.2 × 1.2 m",
            "height": "1.2",
            "width": "1.2",
            "custom": {
              "height": "1.2",
              "width": "1.2",
              "price": 0
            }
          },
          "architrave": {
            "selected": { "type": "", "size": "" },
            "quantity": 0,
            "price": 0
          },
          "quarterRound": {
            "selected": { "type": "", "size": "" },
            "quantity": 0,
            "price": 0
          },
          "ironmongery": {
            "hinges": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "locks": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "handles": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "bolts": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "closers": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            }
          },
          "glassType": "Clear",
          "glassThickness": 3,
          "span": 1.2,
          "isGlassUnderSized": false,
          "recommendedGlassThickness": 3,
          "glazing": {
            "glass": {
              "type": "Clear",
              "thickness": 3,
              "quantity": 1,
              "pricePerM2": 0
            },
            "putty": {
              "quantity": 0,
              "unit": "m",
              "price": 0
            }
          }
        }
      ]
    },
    {
      "type": "internal",
      "blockType": "Standard Block" | "Large Block" | "Small Block",
      "thickness": 0.2,
      "plaster": "Both Sides",
      "doors": [
        {
          "sizeType": "standard",
          "standardSize": "0.9 × 2.1 m",
          "price": 0,
          "custom": {
            "height": "2.1",
            "width": "0.9",
            "price": 0
          },
          "type": "Panel",
          "count": 5,
          "wallThickness": 0.15,
          "frame": {
            "type": "Wood",
            "price": 0,
            "sizeType": "standard",
            "standardSize": "0.9 × 2.1 m",
            "height": "2.1",
            "width": "0.9",
            "custom": {
              "height": "2.1",
              "width": "0.9",
              "price": 0
            }
          },
          "architrave": {
            "selected": { "type": "", "size": "" },
            "quantity": 0,
            "price": 0
          },
          "quarterRound": {
            "selected": { "type": "", "size": "" },
            "quantity": 0,
            "price": 0
          },
          "ironmongery": {
            "hinges": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "locks": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "handles": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "bolts": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            },
            "closers": {
              "selected": { "type": "", "size": "" },
              "quantity": 0,
              "price": 0
            }
          },
          "transom": {
            "enabled": false,
            "height": "",
            "width": "",
            "quantity": 0,
            "price": 0,
            "glazing": {
              "included": false,
              "glassAreaM2": 0,
              "puttyLengthM": 0,
              "glassPricePerM2": 0,
              "puttyPricePerM": 0
            }
          }
        }
      ],
      "windows": []
    }
  ],
  "wallProperties": {
    "blockType": "Standard Block" | "Large Block" | "Small Block",
    "thickness": 0.2,
    "plaster": "Both Sides"
  },
  "floors": 1,
  "foundationDetails": [{ 
    "foundationType": "Strip Footing", 
    "totalPerimeter": 50.5, // Total length of all exterior foundation walls in meters 
    "wallThickness": "0.200", // Thickness of the block/stone wall in meters
    "wallHeight": "1.0", // Height of the block/stone wall in meters 
    "blockDimensions": "0.400 x 0.200 x 0.200" // L x W x H in meters (optional) 
    "height": "1.0" // Height from the bottom of the footing to the top of the ground floor slab
    "length": "5.0" // Length of the foundation
    "width"" "6.0" //Width of the foundation
    "groundFloorElevation": "0.3" // Elevation from ground level to top of slab
  }],
  "foundationWalling": [
    {
      "id": "fwall-external-01",
      "type": "external",
      "blockDimensions": "0.2x0.2x0.2",
      "wallLength": "12.5",
      "wallHeight": "1.0",
      "numberOfWalls": 2,
      "mortarRatio": "1:4"
    },
    {
      "id": "fwall-internal-01",
      "type": "internal",
      "blockDimensions": "0.15x0.2x0.15",
      "wallLength": "8.0",
      "wallHeight": "1.0",
      "numberOfWalls": 1,
      "mortarRatio": "1:4"
    }
  ],
  "ringBeams": [
    {
      "id": string,
      "name": string,
      "perimeter": string, // Total perimeter of ring beam in meters (usually external wall perimeter)
      "width": string, // Width of ring beam in meters (typically 0.2m to 0.3m)
      "depth": string, // Depth of ring beam in meters (typically 0.15m to 0.2m)
      "concrete_mix": string, // Concrete mix ratio e.g., "1:2:4" for C25
      "mainBarSize"?: string, // Main reinforcement bar size (e.g., "D12", "D16")
      "mainBarsCount"?: string, // Number of main bars (e.g., "8", "10", "12")
      "stirrupSize"?: string, // Stirrup bar size (e.g., "D8", "D10")
      "stirrupSpacing"?: string // Stirrup spacing in mm (e.g., "200", "250")
    }
  ],
  "projectType": "residential" | "commercial" | "industrial" | "institutional",
  "floors": number,
  "totalArea": number, //Area covered by the house L x W then multiply by 200%
  "houseType": "bungalow" | "mansionate",
  "description": string
  "clientName": string,
  "projectName": string,
  "projectLocation": string,
  
  "concreteStructures": [
    {
      id:string;
      name: string;
      element: ElementType;
      length: string;
      width: string;
      height: string;
      mix: string;
      formwork?: string;
      category: Category;
      number: string;
      hasConcreteBed?: boolean;
      verandahArea: number;
      slabArea?: number;
      bedDepth?: string;
      hasAggregateBed?: boolean;
      aggregateDepth?: string;
      foundationType?: string;
      clientProvidesWater?: boolean;
      cementWaterRatio?: string;

      isSteppedFoundation?: boolean;
      foundationSteps?: FoundationStep[];
      totalFoundationDepth?: string;

      waterproofing?: WaterproofingDetails;

      reinforcement?: {
        mainBarSize?: RebarSize;
        mainBarSpacing?: string;
        distributionBarSize?: RebarSize;
        distributionBarSpacing?: string;
        connectionDetails?: ConnectionDetails;
      };

      staircaseDetails?: {
        riserHeight?: number;
        treadWidth?: number;
        numberOfSteps?: number;
      };

      tankDetails?: {
        capacity?: string;
        wallThickness?: string;
        coverType?: string;
      };

      septicTankDetails?: SepticTankDetails;
      undergroundTankDetails?: UndergroundTankDetails;
      soakPitDetails?: SoakPitDetails;
      soakawayDetails?: SoakawayDetails;
    }
  ],
  ${
    !hasBBSFile
      ? `
  "reinforcement":[
    {
      id?: string;
      element: ElementTypes;
      name: string;
      length: string;
      width: string;
      depth: string;
      columnHeight?: string;
      mainBarSpacing?: string;
      distributionBarSpacing?: string;
      mainBarsCount?: string;
      distributionBarsCount?: string;
      slabLayers?: string;
      mainBarSize?: RebarSize;
      distributionBarSize?: RebarSize;
      stirrupSize?: RebarSize;
      tieSize?: RebarSize;
      stirrupSpacing?: string;
      tieSpacing?: string;
      category?: Category;
      number?: string;
      reinforcementType?: ReinforcementType;
      rebarCalculationMode: "NORMAL_REBAR_MODE"; //default is NORMAL_REBAR_MODE always
      meshGrade?: string;
      meshSheetWidth?: string;
      meshSheetLength?: string;
      meshLapLength?: string;
      footingType?: FootingType;
      longitudinalBars?: string;
      transverseBars?: string;
      topReinforcement?: string;
      bottomReinforcement?: string;
      retainingWallType?: RetainingWallType;
      heelLength?: string;
      toeLength?: string;
      stemVerticalBarSize?: RebarSize;
      stemHorizontalBarSize?: RebarSize;
      stemVerticalSpacing?: string;
      stemHorizontalSpacing?: string;
    },
    {
      "id": "unique-id-6",
      "element": "tank",
      "name": "Septic Tank ST1",
      "length": "3.0",
      "width": "2.0",
      "depth": "1.8",
      "columnHeight": "",
      "mainBarSpacing": "",
      "distributionBarSpacing": "",
      "mainBarsCount": "",
      "distributionBarsCount": "",
      "slabLayers": "",
      "mainBarSize": "D12",
      "distributionBarSize": "D10",
      "stirrupSize": "",
      "tieSize": "",
      "stirrupSpacing": "",
      "tieSpacing": "",
      "category": "substructure",
      "number": "1",
      "reinforcementType": "individual_bars",
      "meshGrade": "",
      "meshSheetWidth": "",
      "meshSheetLength": "",
      "meshLapLength": "",
      "footingType": "",
      "longitudinalBars": "",
      "transverseBars": "",
      "topReinforcement": "",
      "bottomReinforcement": "",
      "tankType": "septic",
      "tankShape": "rectangular",
      "wallThickness": "0.2",
      "baseThickness": "0.2",
      "coverThickness": "0.15",
      "includeCover": true,
      "wallVerticalBarSize": "D12",
      "wallHorizontalBarSize": "D10",
      "wallVerticalSpacing": "150",
      "wallHorizontalSpacing": "200",
      "baseMainBarSize": "D12",
      "baseDistributionBarSize": "D10",
      "baseMainSpacing": "150",
      "baseDistributionSpacing": "200",
      "coverMainBarSize": "D10",
      "coverDistributionBarSize": "D8",
      "coverMainSpacing": "200",
      "coverDistributionSpacing": "250"
    },
  ],
  `
      : ``
  }
  "equipment":{
    "equipmentData": {
      "standardEquipment": [
        {
          "id": "equip_001",
          "name": "Excavator",
          "description": "Heavy-duty excavator for digging and earthmoving",
          "usage_unit": "day",
          "usage_quantity": 1 // number of days, weeks, hours etc to be used,
          "category": "earthmoving"
        },
      ],
      "customEquipment": [
        {
          "equipment_type_id": "custom_001",
          "name": "Specialized Drilling Rig",
          "desc": "Custom drilling equipment for foundation work",
          "usage_unit": "week",
          "usage_quantity": 1 // number of days, weeks, hours etc to be used,
        },
      ],
    }
  }
  "roofing": {
    "footprintAreaM2": number, // Building footprint area in m²
    "externalPerimeterM": number, // External wall perimeter in meters
    "internalPerimeterM": number, // Internal wall perimeter in meters (for wall plates calculation)
    "buildingLengthM": number, // Building length in meters
    "buildingWidthM": number, // Building width in meters
    "roofTrussTypeKingPost": boolean, // true if king post trusses are used
    "purlinSpacingM": number, // Purlin spacing in meters (default: 1.5)
    "roofingSheetEffectiveCoverWidthM": number, // Effective cover width of roofing sheets (default: 1.0)
    "roofingSheetLengthM": number, // Length of roofing sheets (default: 3.0)
    "roofType": "gable" | "hip" | "pitched" | "flat", // Type of roof
    "pitchDegrees": number, // Roof pitch in degrees (default: 25)
    "eaveWidthM": number, // Eaves width/overhang in meters (default: 0.8)
    "rasterSpacingMm": number, // Rafter spacing in millimeters (default: 600)
    "trussSpacingMm": number // Truss spacing in millimeters (default: 600)
  },
  "plumbing": [
    {
      "id": string,
      "name": string,
      "systemType": PlumbingSystemType,
      "pipes": [
        {
          "id": string,
          "material": PipeMaterial,
          "diameter": number, // from [15,20,...200]
          "length": number,
          "quantity": number,
          "pressureRating"?: string,
          "insulation"?: { "type": string, "thickness": number },
          "trenchDetails"?: { "width": number, "depth": number, "length": number }
        }
      ],
      "fixtures": [
        {
          "id": string,
          "type": FixtureType,
          "count": number,
          "location": string,
          "quality": "standard" | "premium" | "luxury",
          "connections": {
            "waterSupply": boolean,
            "drainage": boolean,
            "vent": boolean
          }
        }
      ],
      "tanks": [],
      "pumps": [],
      "fittings": []
    }
  ],
  "electrical": [
    {
      "id": string,
      "name": string,
      "systemType": ElectricalSystemType,
      "cables": [
        {
          "id": string,
          "type": CableType,
          "size": number, // mm² (from commonCableSizes)
          "length": number,
          "quantity": number,
          "circuit": string,
          "protection": string,
          "installationMethod": InstallationMethod
        }
      ],
      "outlets": [
        {
          "id": string,
          "type": OutletType,
          "count": number,
          "location": string,
          "circuit": string,
          "rating": number, // from commonOutletRatings
          "gang": number, // 1–4
          "mounting": "surface" | "flush"
        }
      ],
      "lighting": [
        {
          "id": string,
          "type": LightingType,
          "count": number,
          "location": string,
          "circuit": string,
          "wattage": number, // from LIGHTING_WATTAGE
          "controlType": "switch" | "dimmer" | "sensor" | "smart",
          "emergency": boolean
        }
      ],
      "distributionBoards": [
        {
          "id": string,
          "type": "main" | "sub",
          "circuits": number,
          "rating": number,
          "mounting": "surface" | "flush",
          "accessories": string[]
        }
      ],
      "protectionDevices": [],
      "voltage": 230 // default if not specified
    }
  ],
  "finishes_calculations": {
    "wall-finishes": [
      {
        "id": string,
        "category": "wall-finishes",
        "material": string, // from COMMON_MATERIALS["wall-finishes"]
        "area": number,
        "quantity": number,
        "unit": "m²" | "m" | "pcs",
        "location": string
      }
    ],
    "joinery": [
      {
        "id": string,
        "category": "joinery",
        "material": string, // from COMMON_MATERIALS["joinery"]
        "area": number,
        "quantity": number,
        "unit": "m²" | "m" | "pcs",
        "location": string
      }
    ],
    "external": [
      {
        "id": string,
        "category": "external",
        "material": string, // from COMMON_MATERIALS["external"]
        "area": number,
        "quantity": number,
        "unit": "m²" | "m" | "pcs",
        "location": string
      }
    ]
  },
  ${
    hasBBSFile
      ? `"bar_schedule": [
    {
      "bar_type": "D6" | "D8" | "D10" | "D12" | "D14" | "D16" | "D18" | "D20" | "D22" | "D25" | "D28" | "D32" | "D36" | "D40" | "D50",
      "bar_length": number, // in meters
      "quantity": number, // total quantity for this bar type and length
      "weight_per_meter"?: number, // optional: estimated weight per meter in kg
      "total_weight"?: number // optional: total weight in kg
    }
  ],
  "rebar_calculation_method": "bbs"`
      : `"rebar_calculation_method": "NORMAL_REBAR_MODE"`
  }
  }
`;
  }

  private extractJsonFromResponse(text: string): ExtractedPlan {
    try {
      // Try to find JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // Map Gemini response to ExtractedPlan interface
      let extractedPlan: ExtractedPlan = {
        ...parsed,
        projectInfo: {
          projectType: parsed.projectType || "residential",
          floors: parsed.floors || 1,
          totalArea: parsed.totalArea || 0,
          description: parsed.projectDescription || parsed.description || "",
        },
      };

      // Calculate foundation wall heights from concrete structures
      extractedPlan = this.calculateFoundationWallHeights(extractedPlan);

      return extractedPlan;
    } catch (error) {
      console.error("JSON extraction error:", error);
      throw new Error(
        `Failed to parse plan response: ${
          error instanceof Error ? error.message : "Invalid JSON"
        }`,
      );
    }
  }

  /**
   * Calculate foundation wall heights by:
   * wallHeight = excavationDepth - stripFootingHeight - groundFloorSlabThickness
   * Ensures both external and internal walls exist
   */
  private calculateFoundationWallHeights(
    extractedPlan: ExtractedPlan,
  ): ExtractedPlan {
    try {
      // Extract key dimensions from concrete structures
      const concreteStructures = extractedPlan.concreteStructures || [];

      // Find excavation depth (from foundation details or deepest concrete element)
      const excavationDepth =
        parseFloat(extractedPlan.foundationDetails?.[0].height || "0") || 0;

      // Find strip footing height by element type
      const stripFooting = concreteStructures.find(
        (c) => c.element?.toLowerCase() === "strip-footing",
      );
      const stripFootingHeight = stripFooting
        ? parseFloat(stripFooting.height || "0")
        : 0;

      // Find ground floor slab thickness by name
      const groundFloorSlab = concreteStructures.find(
        (c) =>
          c.name?.toLowerCase().includes("ground") &&
          c.name?.toLowerCase().includes("slab"),
      );
      const groundFloorSlabThickness = groundFloorSlab
        ? parseFloat(groundFloorSlab.height || "0.15")
        : 0.15; // Default 150mm if not found

      // Calculate foundation wall height
      const calculatedWallHeight =
        excavationDepth - stripFootingHeight - groundFloorSlabThickness;

      // Get wall lengths from wall dimensions
      const wallDimensions = extractedPlan?.wallDimensions;
      const externalWallLength = (
        wallDimensions?.externalWallPerimiter || "0"
      ).toString();
      const internalWallLength = (
        wallDimensions?.internalWallPerimiter || "0"
      ).toString();

      // Ensure both external and internal walls exist
      let foundationWalls = extractedPlan.foundationWalling || [];
      const hasExternal = foundationWalls.some((w) => w.type === "external");
      const hasInternal = foundationWalls.some((w) => w.type === "internal");

      // Add missing external wall if not present
      if (!hasExternal) {
        foundationWalls.push({
          id: "fwall-external-default",
          type: "external",
          blockType: "Standard Natural Block",
          blockDimensions: "0.2x0.2x0.2",
          wallLength: externalWallLength,
          wallHeight:
            calculatedWallHeight > 0 ? calculatedWallHeight.toString() : "1.0",
          numberOfWalls: 1,
          mortarRatio: "1:4",
        });
      }

      // Add missing internal wall if not present
      if (!hasInternal) {
        foundationWalls.push({
          id: "fwall-internal-default",
          type: "internal",
          blockType: "Standard Natural Block",
          blockDimensions: "0.15x0.2x0.15",
          wallLength: internalWallLength,
          wallHeight:
            calculatedWallHeight > 0 ? calculatedWallHeight.toString() : "1.0",
          numberOfWalls: 1,
          mortarRatio: "1:4",
        });
      }

      // Update foundation walls with calculated height and wall lengths
      extractedPlan.foundationWalling = foundationWalls.map((wall) => ({
        ...wall,
        wallHeight:
          calculatedWallHeight > 0
            ? calculatedWallHeight.toString()
            : wall.wallHeight || "1.0", // Fallback to extracted value if calculation fails
        wallLength:
          wall.type === "external"
            ? externalWallLength
            : wall.type === "internal"
              ? internalWallLength
              : wall.wallLength,
      }));

      return extractedPlan;
    } catch (error) {
      console.error("Foundation wall height calculation error:", error);
      // Return original plan if calculation fails
      return extractedPlan;
    }
  }
}

export const planParserService = new PlanParserService();
