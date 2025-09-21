(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-INVALID-TITLE u102)
(define-constant ERR-INVALID-DESCRIPTION u103)
(define-constant ERR-INVALID-RARITY u104)
(define-constant ERR-NFT-ALREADY-EXISTS u105)
(define-constant ERR-NFT-NOT-FOUND u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u108)
(define-constant ERR-INVALID-METADATA u109)
(define-constant ERR-MAX-NFTS-EXCEEDED u110)
(define-constant ERR-INVALID-CATEGORY u111)
(define-constant ERR-INVALID-CREATOR u112)
(define-constant ERR-INVALID-ROYALTY-RATE u113)
(define-constant ERR-INVALID-UPDATE-PARAM u114)

(define-data-var next-nft-id uint u0)
(define-data-var max-nfts uint u10000)
(define-data-var authority-contract (optional principal) none)
(define-data-var royalty-rate uint u5)

(define-map nfts
  { nft-id: uint }
  { creator: principal, hash: (buff 32), title: (string-utf8 50), description: (string-utf8 200), rarity: uint, created-at: uint, category: (string-utf8 20), metadata-uri: (string-utf8 100) })

(define-map nfts-by-hash
  { hash: (buff 32) }
  { nft-id: uint })

(define-map nft-updates
  { nft-id: uint }
  { update-title: (string-utf8 50), update-description: (string-utf8 200), update-metadata-uri: (string-utf8 100), update-timestamp: uint, updater: principal })

(define-read-only (get-nft (nft-id uint))
  (map-get? nfts { nft-id: nft-id })
)

(define-read-only (get-nft-by-hash (hash (buff 32)))
  (map-get? nfts-by-hash { hash: hash })
)

(define-read-only (get-nft-updates (nft-id uint))
  (map-get? nft-updates { nft-id: nft-id })
)

(define-read-only (is-nft-registered (hash (buff 32)))
  (is-some (map-get? nfts-by-hash { hash: hash }))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-title (title (string-utf8 50)))
  (if (and (> (len title) u0) (<= (len title) u50))
      (ok true)
      (err ERR-INVALID-TITLE))
)

(define-private (validate-description (description (string-utf8 200)))
  (if (<= (len description) u200)
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-rarity (rarity uint))
  (if (and (>= rarity u1) (<= rarity u5))
      (ok true)
      (err ERR-INVALID-RARITY))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-category (category (string-utf8 20)))
  (if (or (is-eq category "art") (is-eq category "collectible") (is-eq category "gaming"))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-metadata-uri (uri (string-utf8 100)))
  (if (<= (len uri) u100)
      (ok true)
      (err ERR-INVALID-METADATA))
)

(define-private (validate-creator (creator principal))
  (if (not (is-eq creator 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-CREATOR))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-creator contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-royalty-rate (new-rate uint))
  (begin
    (asserts! (and (>= new-rate u0) (<= new-rate u20)) (err ERR-INVALID-ROYALTY-RATE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set royalty-rate new-rate)
    (ok true)
  )
)

(define-public (mint-nft
  (hash (buff 32))
  (title (string-utf8 50))
  (description (string-utf8 200))
  (rarity uint)
  (category (string-utf8 20))
  (metadata-uri (string-utf8 100))
)
  (let (
        (nft-id (var-get next-nft-id))
        (current-max (var-get max-nfts))
        (authority (var-get authority-contract))
      )
    (asserts! (< nft-id current-max) (err ERR-MAX-NFTS-EXCEEDED))
    (try! (validate-hash hash))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-rarity rarity))
    (try! (validate-category category))
    (try! (validate-metadata-uri metadata-uri))
    (asserts! (is-none (map-get? nfts-by-hash { hash: hash })) (err ERR-NFT-ALREADY-EXISTS))
    (asserts! (is-some authority) (err ERR-AUTHORITY-NOT-VERIFIED))
    (map-set nfts nft-id
      {
        creator: tx-sender,
        hash: hash,
        title: title,
        description: description,
        rarity: rarity,
        created-at: block-height,
        category: category,
        metadata-uri: metadata-uri
      }
    )
    (map-set nfts-by-hash { hash: hash } { nft-id: nft-id })
    (var-set next-nft-id (+ nft-id u1))
    (print { event: "nft-minted", id: nft-id, creator: tx-sender })
    (ok nft-id)
  )
)

(define-public (update-nft
  (nft-id uint)
  (update-title (string-utf8 50))
  (update-description (string-utf8 200))
  (update-metadata-uri (string-utf8 100))
)
  (let ((nft (map-get? nfts { nft-id: nft-id })))
    (match nft
      n
        (begin
          (asserts! (is-eq (get creator n) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-title update-title))
          (try! (validate-description update-description))
          (try! (validate-metadata-uri update-metadata-uri))
          (map-set nfts nft-id
            {
              creator: (get creator n),
              hash: (get hash n),
              title: update-title,
              description: update-description,
              rarity: (get rarity n),
              created-at: (get created-at n),
              category: (get category n),
              metadata-uri: update-metadata-uri
            }
          )
          (map-set nft-updates nft-id
            {
              update-title: update-title,
              update-description: update-description,
              update-metadata-uri: update-metadata-uri,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "nft-updated", id: nft-id })
          (ok true)
        )
      (err ERR-NFT-NOT-FOUND)
    )
  )
)

(define-public (get-nft-count)
  (ok (var-get next-nft-id))
)