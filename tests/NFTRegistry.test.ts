import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, bufferCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_TITLE = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_RARITY = 104;
const ERR_NFT_ALREADY_EXISTS = 105;
const ERR_NFT_NOT_FOUND = 106;
const ERR_AUTHORITY_NOT_VERIFIED = 108;
const ERR_INVALID_METADATA = 109;
const ERR_MAX_NFTS_EXCEEDED = 110;
const ERR_INVALID_CATEGORY = 111;
const ERR_INVALID_CREATOR = 112;
const ERR_INVALID_ROYALTY_RATE = 113;

interface NFT {
  creator: string;
  hash: Uint8Array;
  title: string;
  description: string;
  rarity: number;
  createdAt: number;
  category: string;
  metadataUri: string;
}

interface NFTUpdate {
  updateTitle: string;
  updateDescription: string;
  updateMetadataUri: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class NFTRegistryMock {
  state: {
    nextNftId: number;
    maxNfts: number;
    authorityContract: string | null;
    royaltyRate: number;
    nfts: Map<number, NFT>;
    nftsByHash: Map<string, { nftId: number }>;
    nftUpdates: Map<number, NFTUpdate>;
  } = {
    nextNftId: 0,
    maxNfts: 10000,
    authorityContract: null,
    royaltyRate: 5,
    nfts: new Map(),
    nftsByHash: new Map(),
    nftUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CREATOR";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextNftId: 0,
      maxNfts: 10000,
      authorityContract: null,
      royaltyRate: 5,
      nfts: new Map(),
      nftsByHash: new Map(),
      nftUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CREATOR";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_INVALID_CREATOR };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRoyaltyRate(newRate: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (newRate < 0 || newRate > 20) return { ok: false, value: ERR_INVALID_ROYALTY_RATE };
    this.state.royaltyRate = newRate;
    return { ok: true, value: true };
  }

  mintNft(
    hash: Uint8Array,
    title: string,
    description: string,
    rarity: number,
    category: string,
    metadataUri: string
  ): Result<number> {
    if (this.state.nextNftId >= this.state.maxNfts) return { ok: false, value: ERR_MAX_NFTS_EXCEEDED };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (!title || title.length > 50) return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 200) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (rarity < 1 || rarity > 5) return { ok: false, value: ERR_INVALID_RARITY };
    if (!["art", "collectible", "gaming"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (metadataUri.length > 100) return { ok: false, value: ERR_INVALID_METADATA };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (this.state.nftsByHash.has(Buffer.from(hash).toString("hex"))) return { ok: false, value: ERR_NFT_ALREADY_EXISTS };

    const nftId = this.state.nextNftId;
    const nft: NFT = {
      creator: this.caller,
      hash,
      title,
      description,
      rarity,
      createdAt: this.blockHeight,
      category,
      metadataUri,
    };
    this.state.nfts.set(nftId, nft);
    this.state.nftsByHash.set(Buffer.from(hash).toString("hex"), { nftId });
    this.state.nextNftId++;
    return { ok: true, value: nftId };
  }

  updateNft(nftId: number, updateTitle: string, updateDescription: string, updateMetadataUri: string): Result<boolean> {
    const nft = this.state.nfts.get(nftId);
    if (!nft) return { ok: false, value: ERR_NFT_NOT_FOUND };
    if (nft.creator !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!updateTitle || updateTitle.length > 50) return { ok: false, value: ERR_INVALID_TITLE };
    if (updateDescription.length > 200) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (updateMetadataUri.length > 100) return { ok: false, value: ERR_INVALID_METADATA };

    const updated: NFT = {
      ...nft,
      title: updateTitle,
      description: updateDescription,
      metadataUri: updateMetadataUri,
    };
    this.state.nfts.set(nftId, updated);
    this.state.nftUpdates.set(nftId, {
      updateTitle,
      updateDescription,
      updateMetadataUri,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getNft(nftId: number): NFT | null {
    return this.state.nfts.get(nftId) || null;
  }

  getNftByHash(hash: Uint8Array): { nftId: number } | null {
    return this.state.nftsByHash.get(Buffer.from(hash).toString("hex")) || null;
  }

  getNftCount(): Result<number> {
    return { ok: true, value: this.state.nextNftId };
  }
}

describe("NFTRegistry", () => {
  let contract: NFTRegistryMock;

  beforeEach(() => {
    contract = new NFTRegistryMock();
    contract.reset();
  });

  it("mints an NFT successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mintNft(hash, "ArtPiece", "A unique artwork", 3, "art", "ipfs://meta");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const nft = contract.getNft(0);
    expect(nft?.title).toBe("ArtPiece");
    expect(nft?.description).toBe("A unique artwork");
    expect(nft?.rarity).toBe(3);
    expect(nft?.category).toBe("art");
    expect(nft?.metadataUri).toBe("ipfs://meta");
    expect(nft?.creator).toBe("ST1CREATOR");
  });

  it("rejects duplicate NFT hash", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(1);
    contract.mintNft(hash, "ArtPiece", "A unique artwork", 3, "art", "ipfs://meta");
    const result = contract.mintNft(hash, "Duplicate", "Another artwork", 2, "art", "ipfs://meta2");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NFT_ALREADY_EXISTS);
  });

  it("rejects unauthorized update", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.mintNft(new Uint8Array(32).fill(1), "ArtPiece", "A unique artwork", 3, "art", "ipfs://meta");
    contract.caller = "ST2FAKE";
    const result = contract.updateNft(0, "NewTitle", "New description", "ipfs://newmeta");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("updates NFT successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.mintNft(new Uint8Array(32).fill(1), "ArtPiece", "A unique artwork", 3, "art", "ipfs://meta");
    const result = contract.updateNft(0, "NewArt", "Updated description", "ipfs://newmeta");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const nft = contract.getNft(0);
    expect(nft?.title).toBe("NewArt");
    expect(nft?.description).toBe("Updated description");
    expect(nft?.metadataUri).toBe("ipfs://newmeta");
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(31);
    const result = contract.mintNft(hash, "ArtPiece", "A unique artwork", 3, "art", "ipfs://meta");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid title", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mintNft(hash, "", "A unique artwork", 3, "art", "ipfs://meta");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects invalid rarity", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mintNft(hash, "ArtPiece", "A unique artwork", 6, "art", "ipfs://meta");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RARITY);
  });

  it("rejects invalid category", () => {
    contract.setAuthorityContract("ST2AUTH");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mintNft(hash, "ArtPiece", "A unique artwork", 3, "invalid", "ipfs://meta");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CATEGORY);
  });

  it("rejects minting without authority contract", () => {
    const hash = new Uint8Array(32).fill(1);
    const result = contract.mintNft(hash, "ArtPiece", "A unique artwork", 3, "art", "ipfs://meta");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("sets royalty rate successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setRoyaltyRate(10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.royaltyRate).toBe(10);
  });

  it("rejects invalid royalty rate", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setRoyaltyRate(21);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROYALTY_RATE);
  });

  it("gets NFT count correctly", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.mintNft(new Uint8Array(32).fill(1), "ArtPiece1", "Artwork 1", 3, "art", "ipfs://meta1");
    contract.mintNft(new Uint8Array(32).fill(2), "ArtPiece2", "Artwork 2", 2, "collectible", "ipfs://meta2");
    const result = contract.getNftCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});