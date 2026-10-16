using UAssetAPI;
using UAssetAPI.ExportTypes;
using UAssetAPI.Unversioned;
var a=UAsset.DeserializeJson(File.ReadAllText(args[0]));
a.Mappings=new Usmap { Schemas=new Dictionary<string,UsmapSchema>(), EnumMap=new Dictionary<string,UsmapEnum>() };
foreach(var c in a.Exports.OfType<ClassExport>()) {
 var s=Usmap.GetSchemaFromStructExport(c,true);a.Mappings.Schemas[c.ObjectName.ToString()]=s;
 Console.WriteLine("SCHEMA "+c.ObjectName+" "+s.SuperType+" "+s.PropCount);
}

void Add(string name, params (string name,UsmapPropertyData type)[] fields) {
 var props=new System.Collections.Concurrent.ConcurrentDictionary<int,UsmapProperty>();
 for(int i=0;i<fields.Length;i++)props[i]=new UsmapProperty(fields[i].name,i,0,1,fields[i].type);
 a.Mappings.Schemas[name]=new UsmapSchema(name,null,fields.Length,props,true,null);
}
UsmapPropertyData P(UsmapPropertyType t)=>new UsmapPropertyData(t);
Add("ActiveGameplayEffectHandle",("Handle",P(UsmapPropertyType.IntProperty)),("bPassedFiltersAndWasExecuted",P(UsmapPropertyType.BoolProperty)));
Add("ScalableFloat",("Value",P(UsmapPropertyType.FloatProperty)),("Curve",new UsmapStructData("CurveTableRowHandle")),("RegistryType",new UsmapStructData("DataRegistryType")));
Add("CurveTableRowHandle",("CurveTable",P(UsmapPropertyType.ObjectProperty)),("RowName",P(UsmapPropertyType.NameProperty)));
Add("DataRegistryType",("Name",P(UsmapPropertyType.NameProperty)));

foreach(var raw in a.Exports.OfType<RawExport>().Where(e=>e.ObjectName.ToString().StartsWith("Default__"))) {
 using var reader=a.PathToReader(args[1]);reader.BaseStream.Position=raw.SerialOffset;
 var header=new FUnversionedHeader(reader);
 var parent=raw.GetClassTypeForAncestry(a,out var module);
 Console.WriteLine("DEFAULT "+raw.ObjectName+" HEADER "+(reader.BaseStream.Position-raw.SerialOffset));
 while(true) {
  var start=reader.BaseStream.Position;
  try {
   var value=MainSerializer.Read(reader,null,parent,module,header,true);if(value==null)break;
   var end=reader.BaseStream.Position;
   using var ms=new MemoryStream();using var writer=new AssetBinaryWriter(ms,a);
   try { MainSerializer.Write(value,writer,true); }
   catch(Exception ex) { Console.WriteLine("UNVERIFIED_WRITE "+value.Name+" "+ex.Message); continue; }
   var offset=(int)(start-raw.SerialOffset);
   var exact=ms.ToArray().SequenceEqual(raw.Data.Skip(offset).Take((int)(end-start)));
   if(!exact)throw new Exception("Property roundtrip mismatch");
   Console.WriteLine(a.SerializeJsonObject(value));
   Console.WriteLine("VERIFIED_BYTES "+value.Name+" offset="+offset+" bytes="+(end-start)+" "+value.ToString());
  }catch(Exception ex){Console.WriteLine("STOP offset="+(start-raw.SerialOffset)+" "+ex.Message);break;}
 }
}
