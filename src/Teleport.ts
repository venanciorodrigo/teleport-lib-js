import * as BluebirdPromise from 'bluebird'
import * as isUrl from 'is-url'
import * as fetch from 'isomorphic-fetch'

import Target from './lib/Target'
import Generator from './lib/Generator'
import Publisher from './lib/Publisher'
import ElementsLibrary from './lib/ElementsLibrary'
import ElementsLibraryTargetMapping from './lib/ElementsLibraryTargetMapping'
import transformers from './transformers'
import { Mapping, LibraryDefinition, GuiData } from './types'

export default class Teleport {
  public libraries: object = {}
  public mappings: object = {}
  public targets: object = {}
  public generators: object = {}
  public publishers: object = {}
  public transformers: any = transformers

  // ------------------------------------------------------------
  // generic functions
  // ------------------------------------------------------------

  public async readPluginDefinitionFromFile(path: string): Promise<any> {
    if (typeof window !== 'undefined') throw new Error('reading from files can only be used when lib is used in Node, not within a browser')

    const fs = require('fs')
    if (!fs.existsSync(path)) throw new Error(`path \`${path}\` does not exist`)

    return new Promise((resolve, reject) => {
      try {
        const content = fs.readFileSync(path)
        const json = JSON.parse(content)
        resolve(json)
      } catch (error) {
        reject(error)
      }
    })
  }

  public async readPluginDefinitionFromUrl(url: string) {
    try {
      const response = await fetch(url)
      if (response.status !== 200) throw new Error(`Could not download ${url}: ${response.statusText}`)

      const data = await response.json()
      if (!data) throw new Error(`Could not download ${url}: EMPTY RESPONSE`)

      return data
    } catch (error) {
      throw new Error(error)
    }
  }

  // ------------------------------------------------------------
  // plugins
  // ------------------------------------------------------------

  public async use(plugin: object | string) {
    switch (typeof plugin) {
      case 'string':
        if (isUrl(plugin)) {
          this.usePlugin(await this.readPluginDefinitionFromUrl(plugin as string))
        } else {
          this.usePlugin(await this.readPluginDefinitionFromFile(plugin as string))
        }
        break

      case 'object':
        if (Array.isArray(plugin)) {
          await BluebirdPromise.mapSeries(
            plugin,
            async (pluginItem): Promise<any> => {
              return this.use(pluginItem)
            }
          )
        } else {
          this.usePlugin(plugin as object)
        }
        break
    }
    return this
  }

  public usePlugin(pluginData: object): void {
    switch ((pluginData as any).type) {
      case 'library':
        this.useLibrary(pluginData as LibraryDefinition)
        break
      case 'mapping':
        this.useMapping(pluginData as Mapping)
        break
      case 'generator':
        this.useGenerator(pluginData as Generator)
        break
      case 'publisher':
        this.usePublisher(pluginData as Publisher)
        break
      case 'gui':
        this.useGui(pluginData as GuiData)
        break
      default:
        throw new Error('unrecognised plugin type:' + pluginData)
    }
  }

  // ------------------------------------------------------------
  // libraries
  // ------------------------------------------------------------

  public useLibrary(libraryDefinition: LibraryDefinition): Teleport {
    const library = new ElementsLibrary(libraryDefinition)
    this.libraries[library.name] = library
    return this
  }

  public library(libraryName: string): ElementsLibrary {
    if (!this.libraries[libraryName]) throw new Error(`Library ${libraryName} has not been loaded`)

    return this.libraries[libraryName]
  }

  // ------------------------------------------------------------
  // mappings
  // ------------------------------------------------------------

  public useMapping(mappingData: Mapping): Teleport {
    const map = new ElementsLibraryTargetMapping(mappingData, this)

    this.mappings[map.name] = map

    if (!this.targets[map.target as string]) {
      this.useTarget(map.target as string)
    }

    this.target(map.target as string).useMapping(map)
    // if (this.libraries[map.library]) console.error(` lib ${map.library} does not exist`)
    this.library(map.library as string).useMapping(map)
    return this
  }

  public mapping(mappingName: string): ElementsLibraryTargetMapping | null | undefined {
    return this.mappings[mappingName]
  }

  public map(targetName: string, source: string, type: string): object {
    const target = this.target(targetName)
    if (!target) return null

    return target.map(source, type)
  }

  // ------------------------------------------------------------
  // targets
  // ------------------------------------------------------------

  public useTarget(targetName: string): Teleport {
    if (this.targets[targetName]) throw new Error(`Target ${targetName} is already registered`)

    this.targets[targetName] = new Target(targetName)
    return this
  }

  public target(targetName: string): Target | null | undefined {
    if (!this.targets[targetName]) throw new Error(`No target named '${targetName}' exists.Did you register a mapping or a generator for this target?`)

    return this.targets[targetName]
  }

  // ------------------------------------------------------------
  // generators
  // ------------------------------------------------------------

  public useGenerator(generator: Generator): Teleport {
    if (!this.targets[generator.targetName]) {
      this.useTarget(generator.targetName)
    }

    const target = this.target(generator.targetName)
    generator.setTarget(target)
    target.setGenerator(generator)

    this.generators[generator.name] = generator
    return this
  }

  public generator(generatorName: string): Generator | null | undefined {
    return this.generators[generatorName]
  }

  // ------------------------------------------------------------
  // generators
  // ------------------------------------------------------------
  public usePublisher(publisher: Publisher): Teleport {
    this.publishers[publisher.name] = publisher
    return this
  }

  public publisher(publisherName: string): Publisher | null | undefined {
    return this.publishers[publisherName]
  }

  public useGui(guiData: GuiData) {
    const { library: libraryName } = guiData
    const library = this.library(libraryName)

    if (!library) throw new Error(`Library ${libraryName} was not found for gui package ${guiData.name}`)

    library.useGui(guiData)
    return this
  }
}