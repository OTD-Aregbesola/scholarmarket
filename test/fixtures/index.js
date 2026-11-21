export const users = {
    creator: {
        _id: "user_creator_1",
        walletAddress: "0xCreatorWalletAddress1234567890",
        email: "creator@scholarmarket.test",
        fullName: "Alice Educator",
    },
    buyer: {
        _id: "user_buyer_1",
        walletAddress: "0xBuyerWalletAddress0987654321",
        email: "buyer@scholarmarket.test",
        fullName: "Bob Student",
    }
};

export const materials = {
    draft: {
        _id: "mat_draft_123",
        title: "Draft Macroeconomics Notes",
        description: "In-progress notes.",
        userAddress: users.creator.walletAddress,
        creatorWallet: users.creator.walletAddress,
        status: "draft",
        price: "10",
        asset: "XLM",
        storageKey: "https://scholarmarket.test/files/draft.pdf",
        quarantineState: "clean",
    },
    published: {
        _id: "mat_pub_456",
        title: "Published Microeconomics Notes",
        description: "Complete notes.",
        creatorWallet: users.creator.walletAddress,
        status: "published",
        price: "15",
        asset: "USDC",
        contractId: "C_SOROBAN_CONTRACT_ID_789",
        ipfsHash: "QmTestHash...",
    }
};

export const comparisonMaterials = [
    {
        _id: "cmp_1",
        title: "Calculus Notes",
        author: "Alice Educator",
        price: "10",
        rating: 4.5,
        likes: 12,
        subject: "Mathematics",
        storageKey: "files/calculus.pdf",
        usageRights: "Classroom use allowed.",
    },
    {
        id: "cmp_2",
        title: "Physics Slides",
        author: "Bob Teacher",
        price: "25",
        rating: 3.2,
        likes: 3,
        subject: "Physics",
        storageKey: "files/physics.pptx",
    },
    {
        _id: "cmp_3",
        title: "Essay Guide",
        price: "5",
        storageKey: "files/essay.docx",
    },
    {
        _id: "cmp_4",
        title: "Chemistry Sheet",
        price: "8",
        storageKey: "files/chem.pdf",
    },
];
