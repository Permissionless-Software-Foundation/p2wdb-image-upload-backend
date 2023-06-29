/*
  This library manages file pairs
*/

// Global npm libraries
import { Pin } from 'p2wdb'
import SlpWallet from 'minimal-slp-wallet'
import fs from 'fs'

// import FilePair from './file-pair.js'

class FilePairMgmnt {
  constructor (localConfig = {}) {
    this.adapters = localConfig.adapters
    if (!this.adapters) {
      throw new Error(
        'Instance of Adapters library required when instantiating FilePairMgmnt Controller.'
      )
    }

    // Encapsulate dependencies
    // this.bchWallet = new SlpWallet(undefined, { interface: 'consumer-api' })
    // this.pin = new Pin({bchWallet: this.bchWallet})

    // State
    this.sn = 0
    this.allPairs = []
    this.hasOriginal = false
    this.hasThumbnail = false
    this.useThumbnail = false

    // Bind 'this' object to all subfunctions
    this.addFile = this.addFile.bind(this)
    this.addFileToIpfs = this.addFileToIpfs.bind(this)
  }

  // Add a file to the pair
  addFile (inObj = {}) {
    try {
      console.log('addFile() inObj: ', inObj)

      const { fileSizeInMegabytes, desiredFileName, sn } = inObj

      // Input validation
      if (!fileSizeInMegabytes) {
        throw new Error('File object input must contain a fileSizeInMegabytes property')
      }
      if (!desiredFileName) {
        throw new Error('File object input must contain a desiredFileName property')
      }
      if (!sn) {
        throw new Error('File object input must contain a sn (serial number) property')
      }

      // See if a file pair already exists in the state.
      let snExists = false
      let existingPair
      for (let i = 0; i < this.allPairs.length; i++) {
        const thisPair = this.allPairs[i]

        if (thisPair.sn === sn) {
          snExists = true
          existingPair = thisPair
          break
        }
      }

      if (snExists) {
        // Add the second image to the pair.
        if (desiredFileName.includes('thumbnail')) {
          existingPair.thumbnailFile = inObj
          existingPair.thumbnailFile.isThumbnail = true
          existingPair.thumbnailFile.isOver1MB = false
          if (fileSizeInMegabytes > 1) this.thumbnailFile.isOver1MB = true
        } else {
          existingPair.originalFile = inObj
          existingPair.originalFile.isThumbnail = false
          existingPair.originalFile.isOver1MB = false
          if (fileSizeInMegabytes > 1) this.originalFile.isOver1MB = true
        }

        // Choose the original or the thumbnail to use, based on file size.
        if (existingPair.originalFile.fileSizeInMegabytes > 1) {
          existingPair.useThumbnail = true
        }

        // Signal that the pair has finished uploading and choosing the image
        // is complete.
        existingPair.uploadComplete = true

        console.log('upload complete for this file pair: ', existingPair)

        this.addFileToIpfs(existingPair)
      } else {
        // Create a new File Pair
        const thisPair = new FilePair(inObj)
        console.log('new file pair created: ', thisPair)

        this.allPairs.push(thisPair)
      }
    } catch (err) {
      console.error('Error in addPair(): ', err)
      throw err
    }
  }

  // Remove a file pair from the state.
  removePair (inObj = {}) {

  }

  // Instruct the IPFS node to add the selected file to IPFS, so that it can
  // be downloaded and pinned by the pinning cluster.
  async addFileToIpfs (filePair) {
    try {
      console.log('ready to upload file')
      console.log('filePair: ', filePair)

      // const globSource = this.adapters.ipfs.ipfsAdapter.globSource
      // console.log('globSource: ', globSource)
      const path = `files/${filePair.originalFile.desiredFileName}`

      const readableStream = fs.createReadStream(path)

      const fileObj = {
        path,
        // content: globSource(`/home/trout/work/psf/code/p2wdb-image-upload-backend/files/${filePair.originalFile.desiredFileName}`, { recursive: true})
        content: readableStream
      }
      // console.log('fileObj: ', fileObj)

      // if(filePair.useThumbnail) {
      //   path = { path: `files/${filePair.thumbnailFile.desiredFileName}`}
      //   fileObj = {
      //     path,
      //     content: globSource(path, { recursive: true})
      //   }
      // }

      const options = {
        cidVersion: 1,
        wrapWithDirectory: true
      }

      // const hashes = []
      // for await (const file of this.adapters.ipfs.ipfs.addAll(fileObj, options)) {
      //   hashes.push(file.cid.toString())
      // }
      // console.log('hashes: ', hashes)
      // const cid = hashes[0]

      const fileData = await this.adapters.ipfs.ipfs.add(fileObj, options)
      console.log('fileData: ', fileData)

      const cid = fileData.cid.toString()
      console.log(`File added with CID: ${cid}`)

      const wif = filePair.originalFile.wif

      await this.pinCid({ cid, wif })
    } catch (err) {
      console.error('Error in addFileToIpfs(): ', err)

      // Do not throw errors. This is a top-level function.
    }
  }

  // Pin the CID of the file with the P2WDB pinning cluster
  async pinCid (inObj = {}) {
    try {
      const { cid, wif } = inObj

      console.log('wif: ', wif)
      const bchWallet = new SlpWallet(wif, { interface: 'consumer-api' })
      await bchWallet.initialize()

      const balance = await bchWallet.getBalance()
      console.log('balance: ', balance)
      console.log('walletInfo: ', bchWallet.walletInfo)

      const pin = new Pin({ bchWallet })

      const outData = await pin.cid(cid)
      console.log('outData: ', outData)
    } catch (err) {
      console.error('Error in pinCid()')
      throw err
    }
  }
}

class FilePair {
  constructor (inObj = {}) {
    const { fileSizeInMegabytes, desiredFileName, sn } = inObj

    // Input validation
    if (!fileSizeInMegabytes) {
      throw new Error('File object input must contain a fileSizeInMegabytes property')
    }
    if (!desiredFileName) {
      throw new Error('File object input must contain a desiredFileName property')
    }
    if (!sn) {
      throw new Error('File object input must contain a sn (serial number) property')
    }

    // State
    if (desiredFileName.includes('thumbnail')) {
      this.thumbnailFile = inObj
      this.thumbnailFile.isThubnail = true

      this.thumbnailFile.isOver1MB = false
      if (fileSizeInMegabytes > 1) this.thumbnailFile.isOver1MB = true
    } else {
      this.originalFile = inObj
      this.originalFile.isThumbnail = false

      this.originalFile.isOver1MB = false
      if (fileSizeInMegabytes > 1) this.originalFile.isOver1MB = true
    }

    this.sn = sn
    this.useThumbnail = false
    this.uploadComplete = false
  }
}

export default FilePairMgmnt