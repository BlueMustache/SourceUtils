﻿using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace SourceUtils
{
    public class ValveTriangleFile
    {
        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct MaterialReplacementHeader
        {
            public short MaterialId;
            public int ReplacementMaterialNameOffset;
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct MaterialReplacementListHeader
        {
            public int NumReplacements;
            public int ReplacementOffset;
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct BodyPartHeader
        {
            public int NumModels;
            public int ModelOffset;
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct ModelHeader
        {
            public int NumLods;
            public int LodOffset;
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct ModelLodHeader
        {
            public int NumMeshes;
            public int MeshOffset;
            public float SwitchPoint;
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct MeshHeader
        {
            public int NumStripGroups;
            public int StripGroupHeaderOffset;
            public byte MeshFlags;
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct StripGroupHeader
        {
            public int NumVerts;
            public int VertOffset;

            public int NumIndices;
            public int IndexOffset;

            public int NumStrips;
            public int StripOffset;
        }

        private enum StripHeaderFlags : byte
        {
            None = 0, // I assume?
            IsTriList = 1,
            IsTriStrip = 2
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct StripHeader
        {
            public int NumIndices;
            public int IndexOffset;

            public int NumVerts;
            public int VertOffset;

            public short NumBones;
            public StripHeaderFlags Flags;

            public int NumBoneStateChanges;
            public int BoneStateChangeOffset;
        }

        [StructLayout( LayoutKind.Sequential, Pack = 1 )]
        private struct OptimizedVertex
        {
            public byte BoneWeightIndex0;
            public byte BoneWeightIndex1;
            public byte BoneWeightIndex2;
            public byte NumBones;

            public ushort OrigMeshVertId;

            public sbyte BoneId0;
            public sbyte BoneId1;
            public sbyte BoneId2;

            public override string ToString()
            {
                return OrigMeshVertId.ToString();
            }
        }

        private struct MeshData
        {
            public int LodIndexOffset;
            public int LodVertexOffset;
            public int IndexOffset;
            public int IndexCount;
            public int VertexOffset;
            public int VertexCount;
        }
        
        public static ValveTriangleFile FromStream(Stream stream)
        {
            throw new NotImplementedException();
        }

        public int NumLods { get; }

        private readonly BodyPartHeader[] _bodyParts;
        private readonly ModelHeader[] _models;
        private readonly ModelLodHeader[] _modelLods;
        private readonly MeshData[] _meshes;
        private readonly int[] _indices;
        private readonly StudioVertex[] _vertices;

        public ValveTriangleFile( Stream stream, StudioModelFile mdl, ValveVertexFile vvd )
        {
            var outIndices = new List<int>();
            var outVertices = new List<StudioVertex>();

            using ( var reader = new BinaryReader( stream ) )
            {
                var version = reader.ReadInt32();

                Debug.Assert( version == 7 );

                var vertCacheSize = reader.ReadInt32();
                var maxBonesPerStrip = reader.ReadUInt16();
                var maxBonesPerTri = reader.ReadUInt16();
                var maxBonesPerVert = reader.ReadInt32();

                var checksum = reader.ReadInt32();

                var numLods = NumLods = reader.ReadInt32();
                var matReplacementListOffset = reader.ReadInt32();

                var origVerts = new StudioVertex[numLods][];

                for ( var i = 0; i < numLods; ++i )
                {
                    origVerts[i] = new StudioVertex[vvd.GetVertexCount( i )];
                    vvd.GetVertices( i, origVerts[i] );
                }

                var numBodyParts = reader.ReadInt32();
                var bodyPartOffset = reader.ReadInt32();

                var verts = new List<OptimizedVertex>();
                var indices = new List<ushort>();

                _bodyParts = new BodyPartHeader[numBodyParts];

                var modelList = new List<ModelHeader>();
                var modelLodList = new List<ModelLodHeader>();
                var meshList = new List<MeshData>();

                reader.BaseStream.Seek( bodyPartOffset, SeekOrigin.Begin );
                LumpReader<BodyPartHeader>.ReadLumpFromStream( reader.BaseStream, numBodyParts, (bodyPartIndex, bodyPart) =>
                {
                    reader.BaseStream.Seek( bodyPart.ModelOffset, SeekOrigin.Current );

                    bodyPart.ModelOffset = modelList.Count;

                    LumpReader<ModelHeader>.ReadLumpFromStream( reader.BaseStream, bodyPart.NumModels, (modelIndex, model) =>
                    {
                        reader.BaseStream.Seek( model.LodOffset, SeekOrigin.Current );

                        model.LodOffset = modelLodList.Count;

                        LumpReader<ModelLodHeader>.ReadLumpFromStream( reader.BaseStream, model.NumLods, (lodIndex, lod) =>
                        {
                            // TODO
                            if ( lodIndex > 0 ) return;

                            reader.BaseStream.Seek( lod.MeshOffset, SeekOrigin.Current );

                            lod.MeshOffset = meshList.Count;

                            var lodVerts = origVerts[lodIndex];
                            var firstLodIndex = outVertices.Count;
                            var firstLodVertex = outVertices.Count;

                            LumpReader<MeshHeader>.ReadLumpFromStream( reader.BaseStream, lod.NumMeshes, (meshIndex, mesh) =>
                            {
                                var meshData = new MeshData
                                {
                                    LodIndexOffset = firstLodIndex,
                                    LodVertexOffset = firstLodVertex,
                                    IndexOffset = outIndices.Count,
                                    VertexOffset = outVertices.Count
                                };
                                
                                var meshInfo = mdl.GetMesh( bodyPartIndex, modelIndex, meshIndex );
                                var origVertOffset = meshInfo.VertexOffset;

                                reader.BaseStream.Seek( mesh.StripGroupHeaderOffset, SeekOrigin.Current );
                                LumpReader<StripGroupHeader>.ReadLumpFromStream( reader.BaseStream, mesh.NumStripGroups, stripGroup =>
                                {
                                    verts.Clear();
                                    indices.Clear();

                                    var start = reader.BaseStream.Position;
                                    reader.BaseStream.Seek( start + stripGroup.VertOffset, SeekOrigin.Begin );
                                    LumpReader<OptimizedVertex>.ReadLumpFromStream( reader.BaseStream,
                                        stripGroup.NumVerts, verts );

                                    var meshIndexOffset = outVertices.Count - firstLodVertex;
                                    for ( var i = 0; i < verts.Count; ++i )
                                    {
                                        var vertIndex = origVertOffset + verts[i].OrigMeshVertId;
                                        if ( vertIndex < 0 || vertIndex >= lodVerts.Length )
                                        {
                                            throw new IndexOutOfRangeException();
                                        }
                                        outVertices.Add( lodVerts[vertIndex] );
                                    }

                                    reader.BaseStream.Seek( start + stripGroup.IndexOffset, SeekOrigin.Begin );
                                    LumpReader<ushort>.ReadLumpFromStream( reader.BaseStream,
                                        stripGroup.NumIndices, indices );

                                    reader.BaseStream.Seek( start + stripGroup.StripOffset, SeekOrigin.Begin );
                                    LumpReader<StripHeader>.ReadLumpFromStream( reader.BaseStream, stripGroup.NumStrips, strip =>
                                    {
                                        Debug.Assert( strip.Flags != StripHeaderFlags.IsTriStrip );

                                        for ( var i = 0; i < strip.NumIndices; ++i )
                                        {
                                            outIndices.Add( meshIndexOffset + indices[strip.IndexOffset + i] );
                                        }
                                    } );
                                } );

                                meshData.IndexCount = outIndices.Count - meshData.IndexOffset;
                                meshData.VertexCount = outVertices.Count - meshData.VertexOffset;

                                meshList.Add( meshData );
                            } );

                            modelLodList.Add( lod );
                        } );

                        modelList.Add( model );
                    } );

                    _bodyParts[bodyPartIndex] = bodyPart;
                } );

                _models = modelList.ToArray();
                _modelLods = modelLodList.ToArray();
                _meshes = meshList.ToArray();

                _indices = outIndices.ToArray();
                _vertices = outVertices.ToArray();
            }
        }

        public int GetIndexCount( int bodyPart, int model, int lod )
        {
            return GetIndices( bodyPart, model, lod, null );
        }

        public int GetIndices( int bodyPart, int model, int lod, int[] destArray, int offset = 0 )
        {
            var bodyPartHdr = _bodyParts[bodyPart];
            var modelHdr = _models[bodyPartHdr.ModelOffset + model];
            var lodHdr = _modelLods[modelHdr.LodOffset + lod];

            var total = 0;
            for ( var mesh = 0; mesh < lodHdr.NumMeshes; ++mesh )
            {
                var meshData = _meshes[lodHdr.MeshOffset + mesh];

                if ( destArray != null )
                {
                    Array.Copy( _indices, meshData.IndexOffset, destArray, offset, meshData.IndexCount );
                    offset += meshData.IndexCount;
                }

                total += meshData.IndexCount;
            }

            return total;
        }

        public int GetVertexCount( int bodyPart, int model, int lod )
        {
            return GetVertices( bodyPart, model, lod, null );
        }

        public int GetVertices( int bodyPart, int model, int lod, StudioVertex[] destArray, int offset = 0 )
        {
            var bodyPartHdr = _bodyParts[bodyPart];
            var modelHdr = _models[bodyPartHdr.ModelOffset + model];
            var lodHdr = _modelLods[modelHdr.LodOffset + lod];

            var total = 0;
            for ( var mesh = 0; mesh < lodHdr.NumMeshes; ++mesh )
            {
                var meshData = _meshes[lodHdr.MeshOffset + mesh];

                if ( destArray != null )
                {
                    Array.Copy( _vertices, meshData.VertexOffset, destArray, offset, meshData.VertexCount );
                    offset += meshData.VertexCount;
                }

                total += meshData.VertexCount;
            }

            return total;
        }

        public int GetMeshCount( int bodyPart, int model, int lod )
        {
            var bodyPartHdr = _bodyParts[bodyPart];
            var modelHdr = _models[bodyPartHdr.ModelOffset + model];
            var lodHdr = _modelLods[modelHdr.LodOffset + lod];

            return lodHdr.NumMeshes;
        }

        public void GetMeshData( int bodyPart, int model, int lod, int mesh,
            out int indexOffset, out int indexCount,
            out int vertexOffset, out int vertexCount )
        {
            var bodyPartHdr = _bodyParts[bodyPart];
            var modelHdr = _models[bodyPartHdr.ModelOffset + model];
            var lodHdr = _modelLods[modelHdr.LodOffset + lod];
            var meshData = _meshes[lodHdr.MeshOffset + mesh];

            indexOffset = meshData.IndexOffset - meshData.LodIndexOffset;
            indexCount = meshData.IndexCount;
            vertexOffset = meshData.VertexOffset - meshData.LodVertexOffset;
            vertexCount = meshData.VertexCount;
        }
    }
}
