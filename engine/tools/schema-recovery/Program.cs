using UAssetAPI;
using UAssetAPI.UnrealTypes;
using UAssetAPI.ExportTypes;
Directory.CreateDirectory(args[1]);
foreach(var path in Directory.EnumerateFiles(args[0],"*.uasset",SearchOption.AllDirectories).Where(p=>new[]{"GA_","GE_","GMMC_","GCN_"}.Any(prefix=>Path.GetFileName(p).StartsWith(prefix)))) {
 var a=new UAsset(path,EngineVersion.VER_UE5_4); var recovered=0;
 for(int i=0;i<a.Exports.Count;i++) {
  if(a.Exports[i] is not RawExport raw || raw.ObjectName.ToString().StartsWith("Default__") || raw.SuperIndex.Index==0)continue;
  var b=raw.Data;var candidates=new List<(ClassExport exp,int prefix)>();
  for(int n=0;n<Math.Min(4096,b.Length-12);n++) {
   if(BitConverter.ToInt32(b,n)!=raw.SuperIndex.Index)continue;
   int children=BitConverter.ToInt32(b,n+4);if(children<0||children>a.Exports.Count||n+12+4*children>b.Length)continue;
   bool valid=true;for(int j=0;j<children;j++){int child=BitConverter.ToInt32(b,n+8+4*j);if(child<=0||child>a.Exports.Count)valid=false;}if(!valid)continue;
   int props=BitConverter.ToInt32(b,n+8+4*children);if(props<0||props>1024)continue;
   try {
    using var reader=a.PathToReader(path);reader.BaseStream.Position=raw.SerialOffset;
    var c=raw.ConvertToChildExport<ClassExport>();c.ReviewPrefixLength=n;c.Read(reader,(int)(raw.SerialOffset+raw.SerialSize));
    var consumed=(int)(reader.BaseStream.Position-raw.SerialOffset);
    if(consumed>raw.SerialSize || consumed<=n)continue;
    using var ms=new MemoryStream();using var w=new AssetBinaryWriter(ms,a);c.Write(w);
    if(!ms.ToArray().SequenceEqual(b.Take(consumed)))continue;
    c.Extras=b.Skip(consumed).ToArray();
    Console.WriteLine("BODY_MATCH "+raw.ObjectName+" prefix="+n+" body="+(consumed-n)+" opaqueTail="+c.Extras.Length);
    candidates.Add((c,n));
   }catch(Exception e){Console.WriteLine("FAIL "+raw.ObjectName+" "+n+" "+e.Message);}
  }
  if(candidates.Count==1){a.Exports[i]=candidates[0].exp;recovered++;Console.WriteLine(raw.ObjectName+" prefix="+candidates[0].prefix+" fields="+candidates[0].exp.LoadedProperties.Length);}
 }
 if(recovered>0){var dest=Path.Combine(args[1],Path.GetRelativePath(args[0],path)+".json");Directory.CreateDirectory(Path.GetDirectoryName(dest)!);File.WriteAllText(dest,a.SerializeJson(true));}
}
