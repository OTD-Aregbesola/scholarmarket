import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MaterialDetailsPage from "../page";

const mockMaterial = {
	_id: "mat-123",
	title: "Intro to Soroban Smart Contracts",
	shortSummary: "Hands-on guide to building on Stellar Soroban.",
	description: "Complete course notes and sample contracts.",
	price: 25,
	currency: "XLM",
	version: 2,
	tags: ["stellar", "soroban"],
	verified: true,
	likes: 12,
	viewCount: 150,
	saveCount: 30,
	accessCount: 10,
	category: "blockchain",
	subject: "Computer Science",
	level: "intermediate",
	fileType: "pdf",
	pages: 48,
	visibility: "public",
	learningOutcomes: ["Write Rust smart contracts", "Deploy to Stellar testnet"],
	tableOfContents: ["Chapter 1: Setup", "Chapter 2: Storage"],
	sampleNotes: ["Soroban uses WebAssembly."],
	author: {
		name: "Dr. Ada Lovelace",
		institution: "Stellar Academy",
		level: "Graduate",
		department: "Engineering",
		verified: true,
	},
	createdAt: "2026-01-15T00:00:00.000Z",
	reviews: [],
};

vi.mock("next/navigation", () => ({
	useParams: () => ({ id: "mat-123" }),
	notFound: vi.fn(),
}));

vi.mock("next/image", () => ({
	default: (props) => <img {...props} alt={props.alt || ""} />,
}));

vi.mock("next/link", () => ({
	default: ({ href, children, ...rest }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

vi.mock("framer-motion", () => ({
	motion: {
		div: ({ children, ...rest }) => <div {...rest}>{children}</div>,
	},
}));

vi.mock("@/hooks/api/useMaterials", () => ({
	useMaterialDetail: () => ({
		data: mockMaterial,
		isLoading: false,
		isError: false,
		error: null,
	}),
	useMaterialHistory: () => ({
		data: [],
		isLoading: false,
	}),
}));

vi.mock("@/hooks/api/useEntitlements", () => ({
	useEntitlement: () => ({
		data: { status: "not_purchased", owned: false, hasAccess: false },
		isLoading: false,
		refetch: vi.fn(),
	}),
}));

vi.mock("@/hooks/useWallet", () => ({
	useWallet: () => ({
		address: null,
		networkPassphrase: null,
	}),
}));

vi.mock("@/hooks/useRecentlyViewed", () => ({
	trackRecentlyViewed: vi.fn(),
}));

vi.mock("@/components/Navbar", () => ({
	default: () => <nav data-testid="navbar" />,
}));

vi.mock("@/components/common/QueryStateProvider", () => ({
	QueryStateProvider: ({ query, children }) => children(query.data),
}));

vi.mock("@/components/web3/Web3ErrorBoundary", () => ({
	default: ({ children }) => <>{children}</>,
}));

vi.mock("@/components/materials/ResourceStatusBadge", () => ({
	default: () => <span data-testid="status-badge">Published</span>,
}));

vi.mock("@/components/materials/SaveMaterialButton", () => ({
	default: () => <button type="button">Save</button>,
}));

vi.mock("@/components/materials/ShareMaterialButton", () => ({
	default: () => <button type="button">Share</button>,
}));

vi.mock("@/components/materials/RecommendedMaterials", () => ({
	default: () => <section data-testid="recommended-materials" />,
}));

vi.mock("@/components/materials/MaterialReviewPanel", () => ({
	default: () => <section data-testid="review-panel" />,
}));

vi.mock("@/components/materials/LearnerNotes", () => ({
	default: () => <section data-testid="learner-notes" />,
}));

vi.mock("../modals/BuyNowModal", () => ({
	default: ({ isOpen }) => (isOpen ? <div data-testid="buy-now-modal" /> : null),
}));

describe("MaterialDetailsPage smoke render", () => {
	it("renders composed hero, preview, creator card, purchase panel, and reviews", () => {
		render(<MaterialDetailsPage />);

		expect(
			screen.getByRole("heading", { name: mockMaterial.title })
		).toBeInTheDocument();
		expect(screen.getByText("Dr. Ada Lovelace")).toBeInTheDocument();
		expect(screen.getByText("25 XLM")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /buy now/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /request access/i })).toBeInTheDocument();
		expect(screen.getByTestId("review-panel")).toBeInTheDocument();
		expect(screen.getByTestId("recommended-materials")).toBeInTheDocument();
	});
});
