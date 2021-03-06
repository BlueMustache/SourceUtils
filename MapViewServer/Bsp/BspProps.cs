﻿using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using SourceUtils;
using SourceUtils.ValveBsp;
using Ziks.WebServer;

namespace MapViewServer
{
    partial class BspController
    {
        private string GetModelUrl( string filePath, string mapName = null )
        {
            return MdlController.GetUrl( Request, filePath, mapName );
        }

        [Get( "/{mapName}/static-props" )]
        public JToken GetStaticProps( [Url] string mapName )
        {
            if ( CheckNotExpired( mapName ) ) return null;

            var bsp = GetBspFile( Request, mapName );

            var models = new JArray();
            var modelCount = bsp.StaticProps.ModelCount;
            for ( var i = 0; i < modelCount; ++i )
            {
                var modelName = bsp.StaticProps.GetModelName( i );
                models.Add( bsp.PakFile.ContainsFile( modelName )
                    ? GetModelUrl( modelName, mapName )
                    : GetModelUrl( modelName ) );
            }

            var response = new JArray();
            var propCount = bsp.StaticProps.PropCount;
            for ( var i = 0; i < propCount; ++i )
            {
                int modelIndex, skin;
                bsp.StaticProps.GetPropModelSkin( i, out modelIndex, out skin );

                Vector3 origin, angles;
                bsp.StaticProps.GetPropTransform( i, out origin, out angles );

                StaticPropFlags flags;
                bool solid;
                uint diffMod;
                bsp.StaticProps.GetPropInfo( i, out flags, out solid, out diffMod );

                var clusters = new JArray();
                foreach ( var leaf in bsp.StaticProps.GetPropLeaves( i ) )
                {
                    clusters.Add( bsp.Leaves[leaf].Cluster );
                }

                var obj = new JObject
                {
                    {"model", modelIndex},
                    {"skin", skin},
                    {"origin", origin.ToJson()},
                    {"angles", angles.ToJson()},
                    {"flags", (int) flags},
                    {"solid", solid},
                    {"albedo", diffMod & 0xffffff },
                    {"clusters", clusters}
                };

                if ( (flags & StaticPropFlags.Fades) != 0 )
                {
                    float fadeMin, fadeMax, fadeScale;
                    bsp.StaticProps.GetFadeInfo( i, out fadeMin, out fadeMax, out fadeScale );

                    obj.Add( "fadeMin", fadeMin );
                    obj.Add( "fadeMax", fadeMax );
                    obj.Add( "fadeScale", fadeScale );
                }

                //if ( (flags & StaticPropFlags.NoPerVertexLighting) == 0 )
                {
                    obj.Add( "vertLightingUrl", GetActionUrl( nameof( GetVertexLighting ),
                        Replace( "mapName", mapName ),
                        Replace( "index", i ) ) );
                }

                response.Add( obj );
            }

            return new JObject
            {
                {"models", models},
                {"props", response}
            };
        }

        [Get( "/{mapName}/vert-lighting" )]
        public JToken GetVertexLighting( [Url] string mapName, int index )
        {
            if ( CheckNotExpired( mapName ) ) return null;

            var bsp = GetBspFile( Request, mapName );

            var hdrPath = $"sp_hdr_{index}.vhv";
            var ldrPath = $"sp_{index}.vhv";
            var existingPath = bsp.PakFile.ContainsFile( hdrPath )
                ? hdrPath : bsp.PakFile.ContainsFile( ldrPath ) ? ldrPath : null;

            var array = new JArray();

            if ( existingPath != null )
            {
                ValveVertexLightingFile vhv;
                using ( var stream = bsp.PakFile.OpenFile( existingPath ) )
                {
                    vhv = new ValveVertexLightingFile( stream );
                }

                var meshCount = vhv.GetMeshCount( 0 );
                for ( var meshId = 0; meshId < meshCount; ++meshId )
                {
                    array.Add( SerializeArray( vhv.GetSamples( 0, meshId ), sample => $"{sample.R},{sample.G},{sample.B}" ) );
                }
            }

            return new JObject
            {
                {"meshes", array}
            };
        }
    }
}
